Pod::Spec.new do |s|
  s.name = 'SpottrNativeTabs'
  s.version = '1.0.0'
  s.summary = 'SPOTTR iPhone tab navigation using UIKit.'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'SPOTTR'
  s.homepage = 'https://spottr.ro'
  s.platforms = { :ios => '16.4' }
  # Expo autolinks this development pod by its local path; it is not published.
  s.source = { :git => '' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
