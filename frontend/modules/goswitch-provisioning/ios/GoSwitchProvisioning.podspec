Pod::Spec.new do |spec|
  spec.name = 'GoSwitchProvisioning'
  spec.version = '1.0.0'
  spec.summary = 'GO Switch BLE provisioning'
  spec.license = 'MIT'
  spec.author = 'GO Switch'
  spec.homepage = 'https://github.com/mohan-bee/light-switch'
  spec.source = { :git => 'https://github.com/mohan-bee/light-switch.git' }
  spec.platform = :ios, '16.4'
  spec.swift_version = '5.9'
  spec.static_framework = true
  spec.source_files = '**/*.swift'
  spec.dependency 'ExpoModulesCore'
  spec.dependency 'ESPProvision', '3.2.0'
end
