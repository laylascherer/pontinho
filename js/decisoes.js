// Registrar as escolhas da pessoa (para o treinador analisar depois).
// Fica separado de treinador.js para a tela não precisar carregar a tabela de
// chance (grande): só o Web Worker da análise usa a tabela.

import { textoDaCarta } from './cartas.js';
import { encontrarJogos } from './jogos.js';
import { jogadaCom, descarteSegurando } from './robo.js';
import { aplicarAcao } from './partida.js';

// Devolve null quando não há o que analisar (nenhuma opção, ou a jogada feita não está entre elas).
export function registrarDecisao(partida, id, tipo, acaoFeita) {
  const foto = structuredClone(partida);
  // Só ficam as opções que o jogo deixa fazer de verdade (testadas numa cópia da partida).
  const opcoes = opcoesDaDecisao(foto, id, tipo, acaoFeita).filter(o => jogadaPermitida(foto, id, o.acao));
  const escolhida = opcoes.findIndex(o => mesmaAcao(o.acao, acaoFeita) || (o.segurar && acaoFeita.tipo !== 'baixarJogo'));
  if (opcoes.length === 0 || escolhida < 0) return null;
  return { foto, id, tipo, opcoes, escolhida };
}

function jogadaPermitida(foto, id, acao) {
  try {
    aplicarAcao(structuredClone(foto), id, acao);
    return true;
  } catch {
    return false;
  }
}

const mesmaAcao = (a, b) =>
  a.tipo === b.tipo && a.cartaId === b.cartaId &&
  (a.ids ?? []).slice().sort().join() === (b.ids ?? []).slice().sort().join();

export function opcoesDaDecisao(partida, id, tipo, acaoFeita) {
  const mao = partida.jogadores[id].mao;
  if (tipo === 'compra') {
    const opcoes = [{ rotulo: 'Comprar do monte', acao: { tipo: 'comprarDoMonte' } }];
    const deCima = partida.lixo.at(-1);
    if (deCima && !partida.jogadores[id].queimado && jogadaCom(partida, [...mao, deCima], deCima)) {
      opcoes.push({ rotulo: `Pegar o ${textoDaCarta(deCima)} do lixo`, acao: { tipo: 'comprarDoLixo' } });
    }
    return opcoes;
  }
  if (tipo === 'descarte') {
    // Uma opção por carta diferente (as duas cópias do mesmo 7♥ dão no mesmo).
    const vistas = new Set();
    const opcoes = [];
    for (const c of mao) {
      const nome = textoDaCarta(c);
      if (c.id === partida.cartaDoLixo || vistas.has(nome)) continue;
      vistas.add(nome);
      // A carta feita usa o id exato; a cópia, se houver, cai na mesma opção.
      const feita = mao.find(x => x.id === acaoFeita?.cartaId);
      const cartaId = feita && textoDaCarta(feita) === nome ? feita.id : c.id;
      opcoes.push({ rotulo: `Descartar ${nome}`, acao: { tipo: 'descartar', cartaId } });
    }
    return opcoes;
  }
  // baixar: segurar (o que a pessoa fez em seguida, ou o descarte do Esperto) ou baixar cada jogo.
  // Quem pegou do lixo é obrigado a usar a carta: aí não existe "baixar ou segurar".
  if (partida.cartaDoLixo) return [];
  const segurar = acaoFeita && acaoFeita.tipo !== 'baixarJogo' ? acaoFeita : descarteSegurando(partida, id);
  const opcoes = [{ rotulo: 'Segurar os jogos na mão', acao: segurar, segurar: true }];
  for (const jogo of encontrarJogos(mao, partida.curinga)) {
    opcoes.push({ rotulo: `Baixar ${jogo.map(textoDaCarta).join(' ')}`, acao: { tipo: 'baixarJogo', ids: jogo.map(c => c.id) } });
  }
  return opcoes;
}

