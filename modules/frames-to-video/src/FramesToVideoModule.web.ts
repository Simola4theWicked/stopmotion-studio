import { NativeModule, registerWebModule } from 'expo';

// Video-Export ist im Web nicht verfügbar.
class FramesToVideoModule extends NativeModule<{}> {
  async encodeAsync(): Promise<string> {
    throw new Error('MP4-Export wird im Web nicht unterstützt.');
  }
}

export default registerWebModule(FramesToVideoModule, 'FramesToVideoModule');
