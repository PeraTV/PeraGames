param(
  [Parameter(Mandatory)][string]$ExecutablePath,
  [Parameter(Mandatory)][string]$IconPath
)
$ErrorActionPreference = 'Stop'

if (-not ('PeraGamesIcon' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public static class PeraGamesIcon
{
    private delegate bool ResourceName(IntPtr file, IntPtr type, IntPtr name, IntPtr parameter);
    private delegate bool ResourceLanguage(IntPtr file, IntPtr type, IntPtr name, ushort language, IntPtr parameter);

    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
    [DllImport("kernel32")]
    private static extern bool FreeLibrary(IntPtr module);
    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool EnumResourceNames(IntPtr module, IntPtr type, ResourceName callback, IntPtr parameter);
    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool EnumResourceLanguages(IntPtr module, IntPtr type, IntPtr name, ResourceLanguage callback, IntPtr parameter);
    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr BeginUpdateResource(string file, bool deleteExistingResources);
    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool UpdateResource(IntPtr update, IntPtr type, IntPtr name, ushort language, byte[] data, uint length);
    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool EndUpdateResource(IntPtr update, bool discard);

    public static void Set(string executable, string iconFile)
    {
        var groupType = new IntPtr(14);
        var iconType = new IntPtr(3);
        var groups = new List<Tuple<IntPtr, ushort>>();
        var module = LoadLibraryEx(executable, IntPtr.Zero, 2);
        if (module == IntPtr.Zero) throw new Win32Exception();
        try
        {
            EnumResourceNames(module, groupType, (file, type, name, parameter) =>
            {
                if ((name.ToInt64() >> 16) == 0)
                    EnumResourceLanguages(file, type, name, (m, t, n, language, p) =>
                    {
                        groups.Add(Tuple.Create(n, language));
                        return true;
                    }, IntPtr.Zero);
                return true;
            }, IntPtr.Zero);
        }
        finally { FreeLibrary(module); }
        if (groups.Count == 0) throw new InvalidDataException("Nenhum grupo de ícones numérico foi encontrado no executável.");

        var icon = File.ReadAllBytes(iconFile);
        if (icon.Length < 6 || BitConverter.ToUInt16(icon, 2) != 1) throw new InvalidDataException("ICO inválido.");
        var count = BitConverter.ToUInt16(icon, 4);
        if (count == 0 || icon.Length < 6 + 16 * count) throw new InvalidDataException("Diretório ICO inválido.");
        var directory = new byte[6 + 14 * count];
        Buffer.BlockCopy(icon, 0, directory, 0, 6);
        var images = new List<byte[]>();
        for (var i = 0; i < count; i++)
        {
            var inputEntry = 6 + 16 * i;
            var outputEntry = 6 + 14 * i;
            var size = BitConverter.ToInt32(icon, inputEntry + 8);
            var offset = BitConverter.ToInt32(icon, inputEntry + 12);
            if (size <= 0 || offset < 0 || offset > icon.Length - size) throw new InvalidDataException("Quadro ICO inválido.");
            var frame = new byte[size];
            Buffer.BlockCopy(icon, offset, frame, 0, size);
            images.Add(frame);
            Buffer.BlockCopy(icon, inputEntry, directory, outputEntry, 12);
            Buffer.BlockCopy(BitConverter.GetBytes((ushort)(610 + i)), 0, directory, outputEntry + 12, 2);
        }

        var update = BeginUpdateResource(executable, false);
        if (update == IntPtr.Zero) throw new Win32Exception();
        try
        {
            var languages = new HashSet<ushort>();
            foreach (var group in groups)
            {
                if (languages.Add(group.Item2))
                    for (var i = 0; i < count; i++)
                        if (!UpdateResource(update, iconType, new IntPtr(610 + i), group.Item2, images[i], (uint)images[i].Length))
                            throw new Win32Exception();
                if (!UpdateResource(update, groupType, group.Item1, group.Item2, directory, (uint)directory.Length))
                    throw new Win32Exception();
            }
        }
        catch
        {
            EndUpdateResource(update, true);
            throw;
        }
        if (!EndUpdateResource(update, false)) throw new Win32Exception();
    }
}
'@
}

[PeraGamesIcon]::Set((Resolve-Path -LiteralPath $ExecutablePath).Path, (Resolve-Path -LiteralPath $IconPath).Path)
