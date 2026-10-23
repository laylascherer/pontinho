// Jogo online: as decisões que não dependem da internet (testáveis sem o Firebase).
// - quem joga pelos robôs (e por quem sumiu);
// - o que fazer quando chega uma partida nova do servidor;
// - as decisões de fim de rodada que não podem ficar esperando para sempre.

import { estaConectado } from './salas.js';
import { vezVencida, TEMPO_DA_VEZ } from './partida.js';

// Quem joga pelos robôs: quem criou a sala, se está conectado; senão a próxima pessoa
// conectada, na ordem em que entraram. Todos os celulares fazem a mesma conta.
export function responsavel(sala, presenca, agora = Date.now()) {
  const ordem = [sala.criador, ...sala.uids.filter(u => u !== sala.criador)];
  return ordem.find(uid => estaConectado(presenca, uid, agora)) ?? sala.criador;
}

// A cadeira de quem tem esse uid na partida (-1 se não está nela).
export const meuLugar = (partida, uid) => partida.jogadores.findIndex(j => j.uid === uid);

// A vez de agora precisa ser jogada por um robô? Robô de verdade, ou pessoa que passou do tempo.
// Devolve o nível do robô que joga ('facil' para quem sumiu) ou null.
export function roboDaVez(partida, nivel, agora = Date.now()) {
  if (partida.vez === null) return null;
  const j = partida.jogadores[partida.vez];
  if (j.tipo === 'robo') return nivel;
  return vezVencida(partida, agora) ? 'facil' : null;
}

// Fim da rodada: decisões que o responsável toma por robôs e por quem sumiu.
// - robô que estourou sempre volta;
// - pessoa desconectada há mais de 60 s no fim da rodada: volta (se estourou) e fica pronta;
// - só sobraram robôs: um deles fica pronto (marcarPronto só espera pessoas).
// Devolve uma lista de { id, acao }.
export function decisoesPendentes(partida, presenca, agora = Date.now()) {
  const sumiu = j => j.tipo !== 'robo' && !estaConectado(presenca, j.uid, agora) &&
    partida.inicioDaVez !== null && agora - partida.inicioDaVez >= TEMPO_DA_VEZ;
  if (partida.fase === 'decidirVolta') {
    return partida.jogadores
      .filter(j => j.situacao === 'estourou' && (j.tipo === 'robo' || sumiu(j)))
      .map(j => ({ id: j.id, acao: { tipo: 'decidirVolta', voltar: true } }));
  }
  if (partida.fase === 'fimDaRodada') {
    // Só sobraram robôs na partida: um deles "toca em Pronto" para a mesa seguir.
    const ativos = partida.jogadores.filter(j => j.situacao === 'jogando');
    if (ativos.length && ativos.every(j => j.tipo === 'robo')) return [{ id: ativos[0].id, acao: { tipo: 'pronto' } }];
    return partida.jogadores
      .filter(j => j.situacao === 'jogando' && j.tipo !== 'robo' && !partida.prontos.includes(j.id) && sumiu(j))
      .map(j => ({ id: j.id, acao: { tipo: 'pronto' } }));
  }
  return [];
}

// Chegou uma partida do servidor. O que fazer com a cópia deste celular?
//   'ignorar' → é a mesma partida (ou o servidor ainda não recebeu as minhas jogadas);
//   'adotar'  → trocar pela do servidor. novos = jogadas que este celular ainda não viu.
export function compararComServidor(local, servidor) {
  if (!local) return { decisao: 'adotar', novos: [] };
  if (servidor.versao < local.versao) return { decisao: 'ignorar', novos: [] };
  if (servidor.versao === local.versao) {
    const a = local.eventos.at(-1);
    const b = servidor.eventos.at(-1);
    const iguais = (!a && !b) || (a && b && a.n === b.n && a.tipo === b.tipo && a.jogador === b.jogador);
    if (iguais) return { decisao: 'ignorar', novos: [] };
  }
  return { decisao: 'adotar', novos: servidor.eventos.filter(e => e.n > local.versao) };
}
