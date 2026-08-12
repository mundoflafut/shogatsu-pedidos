# ============================================================
#  Shogatsu - Auxiliar de impressao RAW para Windows
#  Chamado pelo print-agent.js. Manda um arquivo de bytes
#  (ESC/POS ja pronto) direto pra fila de impressao de uma
#  impressora do Windows, sem passar por nenhum driver de
#  texto/GDI -- e o mesmo mecanismo de baixo nivel que
#  qualquer programa profissional de PDV usa.
# ============================================================
param(
    [Parameter(Mandatory=$true)][string]$PrinterName,
    [Parameter(Mandatory=$true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class ShogatsuRawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendBytesToPrinter(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Shogatsu - Cupom";
        di.pDataType = "RAW";

        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("Nao consegui abrir a impressora '" + printerName + "' (nome errado, ou ela nao esta instalada/compartilhada). Erro Windows: " + Marshal.GetLastWin32Error());

        try {
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Exception("Falha ao iniciar o documento de impressao. Erro Windows: " + Marshal.GetLastWin32Error());
            try {
                if (!StartPagePrinter(hPrinter))
                    throw new Exception("Falha ao iniciar a pagina de impressao. Erro Windows: " + Marshal.GetLastWin32Error());
                try {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    try {
                        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                        int dwWritten;
                        if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten))
                            throw new Exception("Falha ao escrever os dados na impressora. Erro Windows: " + Marshal.GetLastWin32Error());
                        if (dwWritten != bytes.Length)
                            throw new Exception("Só " + dwWritten + " de " + bytes.Length + " bytes foram enviados -- pode ter faltado papel ou a impressora travou no meio.");
                    } finally {
                        Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    }
                } finally {
                    EndPagePrinter(hPrinter);
                }
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[ShogatsuRawPrint]::SendBytesToPrinter($PrinterName, $bytes)
Write-Output "OK - $($bytes.Length) bytes enviados para '$PrinterName'"
