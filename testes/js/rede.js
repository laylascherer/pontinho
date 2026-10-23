// Conversa com o Firebase no jogo online: login anônimo, salas e quem está conectado.
// A biblioteca do Firebase só é carregada quando a pessoa entra no modo online,
// então o jogo contra os robôs continua funcionando sem internet.
//
// Toda mudança numa sala é feita numa transação: lê a sala, aplica a regra (salas.js)
// e grava com a versão +1. Se outra pessoa gravou antes, o Firebase repete a conta
// com a sala nova (e as regras de segurança barram versões fora de ordem).

import { FIREBASE_CONFIG } from './firebase-config.js';
import { ErroDeSala, gerarCodigo, novaSala, entrar, sair, mudarRobos, comecar, voltarParaEspera } from './salas.js';
import { aplicarAcao } from './partida.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
const SINAL_A_CADA = 15000; // ms entre um sinal de "estou aqui" e outro

let conexao = null; // { db, fs, uid }
let carregarModulos = () => Promise.all([
  import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
]);

// Para os testes: usar os módulos do Firebase instalados no computador.
export function usarModulos(modulos) {
  carregarModulos = async () => modulos;
  conexao = null;
}

// Entra no Firebase (login anônimo). O mesmo aparelho continua com o mesmo id.
export async function conectar() {
  if (conexao) return conexao.uid;
  const [app, auth, fs] = await carregarModulos();
  // Nome fixo: o login fica guardado no aparelho e a pessoa continua com o mesmo id
  // ao recarregar. (Nos testes, cada "aparelho" importa o módulo com um ?nome diferente.)
  const nome = `pontinho${new URL(import.meta.url).search}`;
  const projeto = app.getApps().find(a => a.name === nome) ?? app.initializeApp(FIREBASE_CONFIG, nome);
  const login = auth.getAuth(projeto);
  await login.authStateReady();
  const usuario = login.currentUser ?? (await auth.signInAnonymously(login)).user;
  conexao = { db: fs.getFirestore(projeto), fs, uid: usuario.uid };
  return conexao.uid;
}

const refDaSala = codigo => conexao.fs.doc(conexao.db, 'salas', codigo);

// Lê a sala, aplica a mudança e grava (tudo junto). mudar(sala) devolve a sala nova,
// ou null para apagar.
// Se outro celular gravou no mesmo instante, as regras do servidor veem a versão dele e
// recusam a nossa ("permission-denied" em vez de "tente de novo"). Então lemos de novo
// e refazemos a conta, algumas vezes.
async function mudarSala(codigo, mudar) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await mudarSalaUmaVez(codigo, mudar);
    } catch (erro) {
      if (erro?.code !== 'permission-denied' || tentativa >= 5) throw erro;
      await new Promise(r => setTimeout(r, 80 * tentativa + Math.random() * 120));
    }
  }
}

async function mudarSalaUmaVez(codigo, mudar) {
  const { db, fs } = conexao;
  const ref = refDaSala(codigo);
  return fs.runTransaction(db, async transacao => {
    const atual = await transacao.get(ref);
    if (!atual.exists()) throw new ErroDeSala('Não achei essa sala. Confira o código.');
    const nova = mudar(atual.data());
    if (nova === null) {
      transacao.delete(ref);
      return null;
    }
    transacao.set(ref, { ...nova, atualizadaEm: fs.serverTimestamp() });
    return nova;
  });
}

// Cria uma sala com um código novo (tenta outro se, por azar, o código já existir).
export async function criarSala(pessoa) {
  await conectar();
  const { db, fs } = conexao;
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = gerarCodigo();
    const ref = refDaSala(codigo);
    const criou = await fs.runTransaction(db, async transacao => {
      if ((await transacao.get(ref)).exists()) return false;
      transacao.set(ref, { ...novaSala(codigo, { ...pessoa, uid: conexao.uid }), criadaEm: fs.serverTimestamp(), atualizadaEm: fs.serverTimestamp() });
      return true;
    });
    if (criou) return codigo;
  }
  throw new ErroDeSala('Não deu para criar a sala agora. Tente de novo.');
}

export async function entrarNaSala(codigo, pessoa) {
  await conectar();
  return mudarSala(codigo, sala => entrar(sala, { ...pessoa, uid: conexao.uid }));
}

export async function sairDaSala(codigo) {
  await conectar();
  return mudarSala(codigo, sala => sair(sala, conexao.uid));
}

export async function escolherRobos(codigo, robos, nivel) {
  await conectar();
  return mudarSala(codigo, sala => mudarRobos(sala, conexao.uid, robos, nivel));
}

// Quem criou começa a partida (ou chama a revanche, no fim do jogo).
export async function comecarPartida(codigo) {
  await conectar();
  return mudarSala(codigo, sala => comecar(sala, conexao.uid));
}

export async function jogarDeNovo(codigo) {
  await conectar();
  return mudarSala(codigo, sala => voltarParaEspera(sala, conexao.uid));
}

// Grava uma jogada. O celular já fez a jogada na sua cópia (depois), a partir da versão base.
// - O servidor ainda está na versão base: grava a cópia do celular (igualzinha, até o embaralhar).
// - Alguém gravou antes: refaz a jogada em cima da partida do servidor; se ela não vale mais,
//   o motor recusa (ErroDeJogada) e nada é gravado. Com estrita (robôs), não refaz: desiste.
export async function mandarJogada(codigo, { base, depois, id, acao, estrita = false }) {
  await conectar();
  return mudarSala(codigo, sala => {
    if (sala.status !== 'jogando' || !sala.partida) throw new ErroDeSala('A partida já acabou.');
    let partida;
    if (sala.partida.versao === base) {
      partida = depois;
    } else if (estrita) {
      throw new ErroDeSala('Outra jogada chegou antes.');
    } else {
      partida = structuredClone(sala.partida);
      aplicarAcao(partida, id, acao);
    }
    return { ...sala, partida: semIndefinidos(partida), versao: sala.versao + 1 };
  });
}

// O Firestore não aceita undefined: a partida vai como JSON puro.
const semIndefinidos = partida => JSON.parse(JSON.stringify(partida));

// Fica de olho na sala: aoMudar(sala) a cada mudança (null se a sala foi apagada).
// Devolve a função que para de olhar.
export function ouvirSala(codigo, aoMudar, aoFalhar = () => {}) {
  return conexao.fs.onSnapshot(refDaSala(codigo), atual => aoMudar(atual.exists() ? atual.data() : null), aoFalhar);
}

// "Estou aqui": manda um sinal agora e de tempos em tempos, e escuta o sinal dos outros.
// aoMudar(presenca) recebe { uid: momento do último sinal (ms) }. Devolve a função que para tudo.
export function marcarPresenca(codigo, aoMudar) {
  const { db, fs, uid } = conexao;
  const meu = fs.doc(db, 'salas', codigo, 'presenca', uid);
  const sinal = () => fs.setDoc(meu, { visto: Date.now() }).catch(() => {});
  sinal();
  const relogio = setInterval(sinal, SINAL_A_CADA);
  const pararDeOuvir = fs.onSnapshot(fs.collection(db, 'salas', codigo, 'presenca'), lista => {
    const presenca = {};
    lista.forEach(item => { presenca[item.id] = item.data().visto; });
    aoMudar(presenca);
  }, () => {});
  return () => {
    clearInterval(relogio);
    pararDeOuvir();
  };
}

export const meuId = () => conexao?.uid ?? null;
