import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

export type ProvisioningDevice = { id: string; name: string };
export type PairingCredentials = { deviceId: string; token: string; hostname: string };
export type ProvisioningRequest = {
  id: string;
  username: string;
  proofOfPossession: string;
  ssid: string;
  password: string;
  existing?: PairingCredentials;
};

type NativeProvisioning = {
  scan(): Promise<ProvisioningDevice[]>;
  provision(
    id: string,
    username: string,
    proofOfPossession: string,
    ssid: string,
    password: string,
    deviceId: string,
    token: string,
    hostname: string,
  ): Promise<PairingCredentials>;
};

const native = Platform.OS === 'ios' || Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeProvisioning>('GoSwitchProvisioning')
  : null;

export function isProvisioningAvailable() {
  return native !== null;
}

async function bluetoothPermissions() {
  const permissions = PermissionsAndroid.PERMISSIONS;
  if (Platform.OS !== 'android') return;
  const required = Number(Platform.Version) >= 31
    ? [permissions.BLUETOOTH_SCAN, permissions.BLUETOOTH_CONNECT]
    : [permissions.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(required);
  if (required.some((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error('Allow Bluetooth device discovery in Settings to continue.');
  }
}

export async function scanProvisioningDevices(): Promise<ProvisioningDevice[]> {
  if (!native) throw new Error('Bluetooth setup requires a GO Switch native build.');
  await bluetoothPermissions();
  return native.scan();
}

export async function provisionDevice(request: ProvisioningRequest): Promise<PairingCredentials> {
  if (!native) throw new Error('Bluetooth setup requires a GO Switch native build.');
  await bluetoothPermissions();
  return native.provision(
    request.id,
    request.username,
    request.proofOfPossession,
    request.ssid,
    request.password,
    request.existing?.deviceId ?? '',
    request.existing?.token ?? '',
    request.existing?.hostname ?? '',
  );
}
