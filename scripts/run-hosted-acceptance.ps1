$readerSource = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TapFormQaCredentialReader {
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
$env:TAPFORM_QA_URL = 'https://yngyfamebdvqilhiuart.supabase.co'
$env:TAPFORM_QA_PUBLISHABLE_KEY = [TapFormQaCredentialReader]::Read('TapForm QA Publishable Key')
$env:TAPFORM_QA_SERVICE_KEY = [TapFormQaCredentialReader]::Read('TapForm QA Secret Key')
$env:TAPFORM_QA_PASSWORD_PERSONAL_A = [TapFormQaCredentialReader]::Read('TapForm QA Password Personal A')
$env:TAPFORM_QA_PASSWORD_PERSONAL_B = [TapFormQaCredentialReader]::Read('TapForm QA Password Personal B')
$env:TAPFORM_QA_PASSWORD_ORGANIZATION_A = [TapFormQaCredentialReader]::Read('TapForm QA Password Organization Owner A')
$env:TAPFORM_QA_PASSWORD_ORGANIZATION_B = [TapFormQaCredentialReader]::Read('TapForm QA Password Organization Owner B')

try {
  if (@($env:TAPFORM_QA_URL, $env:TAPFORM_QA_PUBLISHABLE_KEY, $env:TAPFORM_QA_SERVICE_KEY,
      $env:TAPFORM_QA_PASSWORD_PERSONAL_A, $env:TAPFORM_QA_PASSWORD_PERSONAL_B,
      $env:TAPFORM_QA_PASSWORD_ORGANIZATION_A, $env:TAPFORM_QA_PASSWORD_ORGANIZATION_B) -contains $null -or
      @($env:TAPFORM_QA_PUBLISHABLE_KEY, $env:TAPFORM_QA_SERVICE_KEY,
      $env:TAPFORM_QA_PASSWORD_PERSONAL_A, $env:TAPFORM_QA_PASSWORD_PERSONAL_B,
      $env:TAPFORM_QA_PASSWORD_ORGANIZATION_A, $env:TAPFORM_QA_PASSWORD_ORGANIZATION_B) -contains '') {
    throw 'Protected QA credentials are unavailable.'
  }
  node scripts/hosted-acceptance.mjs
  $exitCode = $LASTEXITCODE
} finally {
  @('TAPFORM_QA_URL', 'TAPFORM_QA_PUBLISHABLE_KEY', 'TAPFORM_QA_SERVICE_KEY',
    'TAPFORM_QA_PASSWORD_PERSONAL_A', 'TAPFORM_QA_PASSWORD_PERSONAL_B',
    'TAPFORM_QA_PASSWORD_ORGANIZATION_A', 'TAPFORM_QA_PASSWORD_ORGANIZATION_B') |
    ForEach-Object { [Environment]::SetEnvironmentVariable($_, $null, 'Process') }
}
exit $exitCode
