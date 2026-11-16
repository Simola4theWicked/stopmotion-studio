import AVFoundation
import ExpoModulesCore
import UIKit

struct FrameSpec: Record {
  @Field var uri: String = ""
  @Field var durationMs: Double = 125
}

struct EncodeOptions: Record {
  @Field var frames: [FrameSpec] = []
  @Field var outputUri: String = ""
  @Field var width: Int = 720
  @Field var height: Int = 960
  @Field var fps: Int = 30
  @Field var bitRate: Int = 6_000_000
}

final class EncodeException: GenericException<String> {
  override var reason: String { param }
}

public class FramesToVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FramesToVideo")

    Events("onProgress")

    AsyncFunction("encodeAsync") { (options: EncodeOptions) -> String in
      try self.encode(options)
    }
  }

  private func fileURL(_ uri: String) -> URL {
    if let url = URL(string: uri), url.isFileURL { return url }
    return URL(fileURLWithPath: uri)
  }

  /// Kodiert die Bilder als H.264-MP4. Jedes Bild beginnt zu seinem Zeitpunkt und bleibt
  /// bis zum nächsten Bild stehen; das letzte bis zum Ende der Sitzung.
  private func encode(_ o: EncodeOptions) throws -> String {
    guard !o.frames.isEmpty else { throw EncodeException("Keine Bilder übergeben") }
    let width = o.width / 2 * 2
    let height = o.height / 2 * 2
    let outURL = fileURL(o.outputUri)
    try? FileManager.default.removeItem(at: outURL)

    let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: o.bitRate,
        AVVideoMaxKeyFrameIntervalKey: max(1, o.fps),
      ],
    ])
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ])
    guard writer.canAdd(input) else { throw EncodeException("Videospur kann nicht angelegt werden") }
    writer.add(input)
    guard writer.startWriting() else {
      throw EncodeException(writer.error?.localizedDescription ?? "Schreiben fehlgeschlagen")
    }
    writer.startSession(atSourceTime: .zero)

    let timescale: CMTimeScale = 1000
    var elapsedMs: Double = 0
    for (i, spec) in o.frames.enumerated() {
      try autoreleasepool {
        guard let image = UIImage(contentsOfFile: fileURL(spec.uri).path) else {
          throw EncodeException("Bild nicht lesbar: \(spec.uri)")
        }
        let buffer = try makePixelBuffer(image: image, width: width, height: height, pool: adaptor.pixelBufferPool)
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
        let time = CMTime(value: CMTimeValue(elapsedMs.rounded()), timescale: timescale)
        if !adaptor.append(buffer, withPresentationTime: time) {
          throw EncodeException(writer.error?.localizedDescription ?? "Bild \(i + 1) konnte nicht geschrieben werden")
        }
      }
      elapsedMs += max(1, spec.durationMs)
      sendEvent("onProgress", ["done": i + 1, "total": o.frames.count])
    }

    input.markAsFinished()
    writer.endSession(atSourceTime: CMTime(value: CMTimeValue(elapsedMs.rounded()), timescale: timescale))
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    if writer.status != .completed {
      throw EncodeException(writer.error?.localizedDescription ?? "Video konnte nicht abgeschlossen werden")
    }
    return outURL.absoluteString
  }

  private func makePixelBuffer(image: UIImage, width: Int, height: Int, pool: CVPixelBufferPool?) throws -> CVPixelBuffer {
    var pb: CVPixelBuffer?
    if let pool = pool {
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
    } else {
      CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32ARGB, nil, &pb)
    }
    guard let buffer = pb else { throw EncodeException("Pixelpuffer konnte nicht erstellt werden") }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let ctx = CGContext(
      data: CVPixelBufferGetBaseAddress(buffer),
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else { throw EncodeException("Zeichenkontext konnte nicht erstellt werden") }

    ctx.setFillColor(UIColor.black.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))

    // Bild proportional einpassen (letterbox); UIKit-Zeichnung berücksichtigt die Ausrichtung
    let scale = min(CGFloat(width) / image.size.width, CGFloat(height) / image.size.height)
    let w = image.size.width * scale
    let h = image.size.height * scale
    let rect = CGRect(x: (CGFloat(width) - w) / 2, y: (CGFloat(height) - h) / 2, width: w, height: h)
    UIGraphicsPushContext(ctx)
    ctx.translateBy(x: 0, y: CGFloat(height))
    ctx.scaleBy(x: 1, y: -1)
    image.draw(in: rect)
    UIGraphicsPopContext()
    return buffer
  }
}
