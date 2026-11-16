Pod::Spec.new do |s|
  s.name           = 'FramesToVideo'
  s.version        = '1.0.0'
  s.summary        = 'Erzeugt MP4-Videos aus Einzelbildern'
  s.description    = 'Lokales Expo-Modul der Stop-Motion-App: kodiert Einzelbilder als H.264-MP4.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
