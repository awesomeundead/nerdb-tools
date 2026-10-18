// Termos entre parênteses no fim do personagem, ex.: "Policial #2 (voice, uncredited)".
// Para padronizar mais um termo, basta adicionar aqui (chave em minúsculas).
export const TAIL_TERMS = {
    'voice':          'voz',
    'voice only':     'somente voz',
    'singing voice':  'voz cantada',
    'uncredited':     'sem créditos',
    'credit only':    'somente créditos',
    'archive footage':'imagens de arquivo',
    'archive sound':  'áudio de arquivo',
    'cameo':          'participação especial',
    'deleted scene':  'cena deletada',
    'deleted scenes': 'cenas deletadas',
    'as a child':     'criança',
    'young':          'jovem',
    'photo':          'foto',
};

export function translateTail(tail)
{
    return tail.replace(/\(([^()]*)\)/g, (_, inner) => {
        const parts = inner.split(',').map(p => p.trim());
        return `(${parts.map(p => TAIL_TERMS[p.toLowerCase()] ?? p).join(', ')})`;
    });
}
