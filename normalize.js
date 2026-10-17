// "Policeman #2 (uncredited)" -> base "Policeman", tail " #2 (uncredited)"
export function split(character)
{
    const m = character.match(/^(.*?)(\s+#?\d+)?(\s*\(.*\))?$/);
    if (!m) return { base: character.trim(), tail: '' };

    return { base: m[1].trim(), tail: (m[2] ?? '') + (m[3] ?? '') };
}

// Só texto ASCII, curto e não vazio: o que já está em português ou tem acento fica de fora.
export const isCandidate = base =>
    base !== '' && /^[\x20-\x7E]+$/.test(base) && base.split(/\s+/).length <= 4;
