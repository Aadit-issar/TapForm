$ErrorActionPreference = 'Stop'

$readerSource = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TapFormQaBuildCredentialReader {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  private struct Credential {
    public uint Flags; public uint Type; public IntPtr TargetName; public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError=true)] private static extern void CredFree(IntPtr buffer);
  public static string Read(string target) {
    IntPtr pointer;
    if (!CredRead(target, 1, 0, out pointer)) return null;
    try {
      var credential = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
      if (credential.CredentialBlobSize == 0 || credential.CredentialBlobSize > 65536) return null;
      var bytes = new byte[(int)credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, bytes, 0, bytes.Length);
      bool utf16 = bytes.Length >= 2;
      for (int i = 1; i < bytes.Length && utf16; i += 2) if (bytes[i] != 0) utf16 = false;
      return (utf16 ? Encoding.Unicode : Encoding.UTF8).GetString(bytes).TrimEnd('\0');
    } finally { CredFree(pointer); }
  }
}
'@

Add-Type -TypeDefinition $readerSource
$env:EXPO_PUBLIC_SUPABASE_URL = 'https://yngyfamebdvqilhiuart.supabase.co'
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY = [TapFormQaBuildCredentialReader]::Read('TapForm QA Publishable Key')
$env:EXPO_PUBLIC_DEMO_MODE = 'false'

if ([string]::IsNullOrWhiteSpace($env:EXPO_PUBLIC_SUPABASE_ANON_KEY)) {
  throw 'The staging publishable key is unavailable in Windows Credential Manager.'
}

$buildExitCode = 1
Push-Location (Join-Path $PSScriptRoot '..\android')
try {
  & .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:bundleRelease :tapform-nfc-peer:testDebugUnitTest --rerun-tasks
  $buildExitCode = $LASTEXITCODE
} finally {
  @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_DEMO_MODE') |
    ForEach-Object { [Environment]::SetEnvironmentVariable($_, $null, 'Process') }
  Pop-Location
}

exit $buildExitCode
