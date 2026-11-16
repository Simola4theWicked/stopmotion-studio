package expo.modules.framestovideo

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

class FrameSpec : Record {
  @Field val uri: String = ""
  @Field val durationMs: Double = 125.0
}

class EncodeOptions : Record {
  @Field val frames: List<FrameSpec> = emptyList()
  @Field val outputUri: String = ""
  @Field val width: Int = 720
  @Field val height: Int = 960
  @Field val fps: Int = 30
  @Field val bitRate: Int = 6_000_000
}

class EncodeException(message: String, cause: Throwable? = null) :
  CodedException("ERR_ENCODE", message, cause)

class FramesToVideoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FramesToVideo")

    Events("onProgress")

    AsyncFunction("encodeAsync") { options: EncodeOptions ->
      try {
        encode(options)
      } catch (e: CodedException) {
        throw e
      } catch (e: Throwable) {
        throw EncodeException(e.message ?: e.toString(), e)
      }
    }
  }

  private fun toPath(uri: String): String =
    if (uri.startsWith("file://")) Uri.parse(uri).path!! else uri

  /**
   * Kodiert die Bilder als H.264-MP4 mit konstanter Bildrate. Jedes Bild wird so oft
   * wiederholt, wie es seiner Anzeigedauer entspricht (mindestens einmal).
   */
  private fun encode(o: EncodeOptions): String {
    if (o.frames.isEmpty()) throw EncodeException("Keine Bilder übergeben")
    val width = o.width / 2 * 2
    val height = o.height / 2 * 2
    val fps = o.fps.coerceIn(1, 60)
    val outPath = toPath(o.outputUri)
    File(outPath).delete()

    // Anzahl der Videobilder je Einzelbild (kumulativ gerundet, damit sich Fehler nicht aufaddieren)
    val repeats = IntArray(o.frames.size)
    var elapsedMs = 0.0
    var emitted = 0L
    o.frames.forEachIndexed { i, f ->
      elapsedMs += f.durationMs
      val target = max(emitted + 1, (elapsedMs * fps / 1000.0).roundToLong())
      repeats[i] = (target - emitted).toInt()
      emitted = target
    }

    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
      setInteger(MediaFormat.KEY_BIT_RATE, o.bitRate)
      setInteger(MediaFormat.KEY_FRAME_RATE, fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()
    val muxer = MediaMuxer(outPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val state = MuxState()
    val info = MediaCodec.BufferInfo()

    try {
      val canvasBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(canvasBitmap)
      val paint = Paint(Paint.FILTER_BITMAP_FLAG)
      val argb = IntArray(width * height)
      val y = ByteArray(width * height)
      val u = ByteArray((width / 2) * (height / 2))
      val v = ByteArray((width / 2) * (height / 2))
      var frameIndex = 0L

      o.frames.forEachIndexed { i, spec ->
        drawFitted(toPath(spec.uri), canvas, paint, width, height)
        canvasBitmap.getPixels(argb, 0, width, 0, 0, width, height)
        argbToI420(argb, width, height, y, u, v)

        repeat(repeats[i]) {
          val ptsUs = frameIndex * 1_000_000L / fps
          queueFrame(codec, y, u, v, width, height, ptsUs)
          frameIndex++
          drain(codec, muxer, state, info, false)
        }
        sendEvent("onProgress", mapOf("done" to i + 1, "total" to o.frames.size))
      }

      // Ende signalisieren
      val inIndex = dequeueInput(codec)
      codec.queueInputBuffer(inIndex, 0, 0, frameIndex * 1_000_000L / fps, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      drain(codec, muxer, state, info, true)
      canvasBitmap.recycle()
    } finally {
      try { codec.stop() } catch (_: Throwable) {}
      codec.release()
      try { if (state.started) muxer.stop() } catch (_: Throwable) {}
      muxer.release()
    }
    return Uri.fromFile(File(outPath)).toString()
  }

  private class MuxState {
    var track = -1
    var started = false
  }

  private fun dequeueInput(codec: MediaCodec): Int {
    repeat(500) {
      val index = codec.dequeueInputBuffer(10_000)
      if (index >= 0) return index
    }
    throw EncodeException("Encoder antwortet nicht")
  }

  private fun drawFitted(path: String, canvas: Canvas, paint: Paint, width: Int, height: Int) {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0) throw EncodeException("Bild nicht lesbar: $path")
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= width && bounds.outHeight / (sample * 2) >= height) sample *= 2
    val bmp = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: throw EncodeException("Bild nicht lesbar: $path")
    val scale = min(width.toFloat() / bmp.width, height.toFloat() / bmp.height)
    val w = bmp.width * scale
    val h = bmp.height * scale
    canvas.drawColor(Color.BLACK)
    canvas.drawBitmap(bmp, null, RectF((width - w) / 2, (height - h) / 2, (width + w) / 2, (height + h) / 2), paint)
    bmp.recycle()
  }

  private fun argbToI420(argb: IntArray, width: Int, height: Int, y: ByteArray, u: ByteArray, v: ByteArray) {
    val cw = width / 2
    for (row in 0 until height) {
      val rowOffset = row * width
      for (col in 0 until width) {
        val c = argb[rowOffset + col]
        val r = (c shr 16) and 0xff
        val g = (c shr 8) and 0xff
        val b = c and 0xff
        y[rowOffset + col] = (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).toByte()
        if (row and 1 == 0 && col and 1 == 0) {
          val ci = (row / 2) * cw + col / 2
          u[ci] = (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128).toByte()
          v[ci] = (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128).toByte()
        }
      }
    }
  }

  private fun queueFrame(
    codec: MediaCodec, y: ByteArray, u: ByteArray, v: ByteArray, width: Int, height: Int, ptsUs: Long
  ) {
    val index = dequeueInput(codec)
    val image = codec.getInputImage(index) ?: throw EncodeException("Encoder liefert kein Eingabebild")
    val planes = image.planes
    writePlane(planes[0], y, width, height)
    writePlane(planes[1], u, width / 2, height / 2)
    writePlane(planes[2], v, width / 2, height / 2)
    codec.queueInputBuffer(index, 0, width * height * 3 / 2, ptsUs, 0)
  }

  private fun writePlane(plane: android.media.Image.Plane, data: ByteArray, w: Int, h: Int) {
    val buffer = plane.buffer
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    for (row in 0 until h) {
      val base = row * rowStride
      if (pixelStride == 1) {
        buffer.position(base)
        buffer.put(data, row * w, w)
      } else {
        for (col in 0 until w) {
          buffer.put(base + col * pixelStride, data[row * w + col])
        }
      }
    }
  }

  private fun drain(codec: MediaCodec, muxer: MediaMuxer, state: MuxState, info: MediaCodec.BufferInfo, endOfStream: Boolean) {
    var idleRounds = 0
    while (true) {
      val index = codec.dequeueOutputBuffer(info, 10_000)
      when {
        index == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!endOfStream) return
          if (++idleRounds > 500) throw EncodeException("Encoder hängt beim Abschließen")
        }
        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          if (state.started) throw EncodeException("Ausgabeformat doppelt geändert")
          state.track = muxer.addTrack(codec.outputFormat)
          muxer.start()
          state.started = true
        }
        index >= 0 -> {
          val buffer = codec.getOutputBuffer(index)!!
          if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
          if (info.size > 0 && state.started) {
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            muxer.writeSampleData(state.track, buffer, info)
          }
          codec.releaseOutputBuffer(index, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
        }
      }
    }
  }
}
