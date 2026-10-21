// As telas do jogo. A cada mudança, a tela inteira é desenhada de novo a partir
// do estado (render). Os toques chegam por data-acao="..." nos botões.

import {
  novaPartida, comprarDoMonte, comprarDoLixo, devolverAoLixo, baixarJogo, encaixar,
  descartar, decidirVolta, proximaRodada, jogadoresAtivos, ErroDeJogada,
  podeAmeacar, ameacarBater, desistirDeBater, trocarCuringa,
} from './partida.js';
import { analisarJogo, analisarEncaixe, inicioDe, naipeDe, valorNaPosicao, encontrarJogos } from './jogos.js';
import { nomeDoValor, pontosNaMao, textoDaCarta, ehCuringa } from './cartas.js';
import { proximaAcao, executarAcao, planoParaBater } from './robo.js';
import { voar, retangulo } from './animacao.js';
import { registrarDecisao } from './decisoes.js';
import { tocar, destravarSom, preferencias, mudarPreferencia } from './sons.js';
import { explicarDecisao, errosQueMaisSeRepetem } from './explicacoes.js';

const VOCE = 0;
const PAUSA_DO_ROBO = 900;   // milissegundos entre uma ação e outra do robô
const REACAO_DO_ROBO = 600;  // quanto um robô pifado demora para "ver" a carta no lixo
const NOMES_ROBOS = ['Ana', 'Beto', 'Cida'];
const ROSTOS = [
  { inicial: 'V', cor: '#e8b84a' },
  { inicial: 'A', cor: '#8fd3b0' },
  { inicial: 'B', cor: '#9cc3f0' },
  { inicial: 'C', cor: '#f0b59c' },
];

const estado = {
  tela: 'inicio',     // inicio | novaPartida | mesa | fimRodada | fimJogo | analise | detalhe | relatorio
  treinador: true,    // modo treinador: grava as suas escolhas e analisa no fim da rodada
  treino: [],         // por rodada: { rodada, escolhas: [{ decisao, analise, explicacao, quando, texto }], pronta }
  vezNaRodada: 0,     // quantas vezes você já jogou nesta rodada
  baixarAnotado: false, // "baixar ou segurar" já foi gravado nesta sua vez?
  rodadaVista: null,  // qual rodada a tela de análise mostra
  escolhaVista: null, // qual escolha o detalhe mostra
  filtroTreino: 'todas',
  voltarDoTreino: 'fimRodada',
  qtdRobos: 1,
  nivel: 'facil',     // nível dos robôs: facil | esperto
  lixoVisto: null,    // última carta do lixo que os robôs já olharam
  fichaDoRobo: 0,     // muda a cada vez agendada; uma vez antiga não joga mais
  partida: null,
  selecionadas: [],   // ids das cartas que você tocou
  ordem: 'naipe',     // como organizar a mão: naipe | numero
  ordemDaMao: [],     // ids das suas cartas na ordem em que aparecem (você pode arrastar)
  menuAberto: false,
  animando: false,    // true enquanto as cartas voam
  avisouSuaVez: false, // o sininho de "sua vez" já tocou nesta vez?
  vezesQueBateu: 0,
  saiuNaRodada: {},   // id do jogador → rodada em que saiu
};

const app = document.getElementById('app');
const toast = document.getElementById('toast');

// ---------- Pedacinhos de tela ----------

const ICONES = {
  menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  organizar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
  alerta: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f08a4b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
  estouro: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f08a4b" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>',
  treino: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e8b84a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h18"/><path d="M6 16l4-5 3 3 5-7"/><path d="M15 7h3v3"/></svg>',
  voltar: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  trofeu: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#e8b84a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/><path d="M12 14v4M8 21h8M9 18h6"/></svg>',
};

const ehVermelha = c => c.naipe === '♥' || c.naipe === '♦';

// curinga: mostra o selo dourado (a carta é curinga nesta rodada, ou está no lugar de outra na mesa).
function carta(c, { tamanho = '', classes = '', estilo = '', botao = false, extra = '', curinga = false } = {}) {
  const cor = ehVermelha(c) ? ' vermelha' : '';
  const meio = tamanho === 'grande' ? `<span class="meio">${c.naipe}</span>` : '';
  const selo = curinga ? '<span class="selo-curinga" aria-label="curinga">C</span>' : '';
  const conteudo = `<span class="v">${nomeDoValor(c.valor)}</span><span class="n">${c.naipe}</span>${meio}${selo}${extra}`;
  const classe = `carta ${tamanho}${cor} ${classes}`;
  return botao
    ? `<button class="${classe}" style="${estilo}" data-acao="carta" data-id="${c.id}" aria-label="${textoDaCarta(c)}" aria-pressed="${classes.includes('escolhida')}">${conteudo}</button>`
    : `<span class="${classe}" style="${estilo}" data-carta="${c.id ?? ''}">${conteudo}</span>`;
}

function avatar(id, tamanho = 38) {
  const rosto = ROSTOS[id];
  return `<span class="avatar" style="background:${rosto.cor};width:${tamanho}px;height:${tamanho}px">${rosto.inicial}</span>`;
}

const nome = id => estado.partida.jogadores[id].nome;

const ORDEM_NAIPE = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };
function ordenarPor(mao, ordem) {
  const porNaipe = (a, b) => ORDEM_NAIPE[a.naipe] - ORDEM_NAIPE[b.naipe] || a.valor - b.valor;
  const porNumero = (a, b) => a.valor - b.valor || ORDEM_NAIPE[a.naipe] - ORDEM_NAIPE[b.naipe];
  return [...mao].sort(ordem === 'naipe' ? porNaipe : porNumero);
}

// A mão aparece na ordem que você arrumou. Mão nova começa organizada por naipe ou número;
// carta comprada entra no fim (à direita).
function maoOrdenada(mao) {
  const guardadas = estado.ordemDaMao.filter(id => mao.some(c => c.id === id));
  estado.ordemDaMao = guardadas.length === 0
    ? ordenarPor(mao, estado.ordem).map(c => c.id)
    : [...guardadas, ...mao.filter(c => !guardadas.includes(c.id)).map(c => c.id)];
  return estado.ordemDaMao.map(id => mao.find(c => c.id === id));
}

// Em que lugar da sequência está o curinga que esta carta verdadeira substitui (-1 se nenhum).
function lugarDoCuringa(jogo, carta) {
  if (jogo.tipo !== 'sequencia' || !Object.keys(jogo.curingas ?? {}).length) return -1;
  const inicio = inicioDe(jogo);
  return jogo.cartas.findIndex((c, i) =>
    c.id in jogo.curingas && carta.naipe === naipeDe(jogo) && carta.valor === valorNaPosicao(inicio + i));
}

// ---------- Tela: Início ----------

function telaInicio() {
  return `
  <section class="tela inicio">
    <div class="leque" aria-hidden="true">
      ${carta({ valor: 1, naipe: '♠' }, { estilo: 'left:28px;top:18px;transform:rotate(-14deg)' })}
      ${carta({ valor: 7, naipe: '♥' }, { estilo: 'left:62px;top:6px' })}
      ${carta({ valor: 13, naipe: '♦' }, { estilo: 'left:96px;top:18px;transform:rotate(14deg)' })}
    </div>
    <h1 class="titulo-jogo">Pontinho</h1>
    <p class="suave" style="margin-top:6px;font-size:15px">Jogo de cartas · 2 a 4 jogadores</p>
    <div class="lista-botoes">
      <button class="botao principal" data-acao="novaPartida">Jogar</button>
      ${pedidoDeInstalar ? '<button class="botao forte" data-acao="instalar">Instalar no celular</button>' : ''}
    </div>
    <p class="suave pequeno" style="margin-top:auto">Versão de teste</p>
  </section>`;
}

// ---------- Tela: Nova partida ----------

function telaNovaPartida() {
  const q = estado.qtdRobos;
  const quantidades = [1, 2, 3].map(n =>
    `<button class="opcao${q === n ? ' ativa' : ''}" data-acao="escolherRobos" data-n="${n}" aria-pressed="${q === n}">${n}</button>`).join('');
  const robos = NOMES_ROBOS.slice(0, q).map((nome, i) => `<span class="chip-robo">${avatar(i + 1, 28)}${nome}</span>`).join('');
  const niveis = [['facil', 'Fácil', 'Para aprender'], ['esperto', 'Esperto', 'Pensa na estratégia']].map(([id, titulo, sub]) =>
    `<button class="opcao nivel${estado.nivel === id ? ' ativa' : ''}" data-acao="escolherNivel" data-nivel="${id}" aria-pressed="${estado.nivel === id}"><strong>${titulo}</strong><span>${sub}</span></button>`).join('');
  const dica = q >= 2
    ? 'Com 3 ou mais jogadores valem a volta depois de estourar e o pifado: pegar do lixo fora da vez para bater.'
    : 'No 1 contra 1 não tem volta depois de estourar nem pifado.';
  return `
  <section class="tela nova-partida">
    <div class="barra-topo" style="justify-content:flex-start;gap:8px">
      <button class="icone" data-acao="inicio" aria-label="Voltar">${ICONES.voltar}</button>
      <h1 style="font-size:22px;font-weight:700">Nova partida</h1>
    </div>
    <div class="campo">
      <span class="rotulo-campo">Quantos robôs na mesa?</span>
      <div class="grade-opcoes" style="grid-template-columns:repeat(3,minmax(0,1fr))">${quantidades}</div>
      <div class="chips">${robos}</div>
    </div>
    <div class="campo">
      <span class="rotulo-campo">Nível dos robôs</span>
      <div class="grade-opcoes" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        ${niveis}
      </div>
    </div>
    <button class="interruptor-treino${estado.treinador ? ' ligado' : ''}" data-acao="alternarTreino" role="switch" aria-checked="${estado.treinador}">
      <span class="icone-treino">${ICONES.treino}</span>
      <span style="flex:1;display:flex;flex-direction:column;gap:3px;text-align:left">
        <span style="font-size:16px;font-weight:700">Modo treinador</span>
        <span class="suave" style="font-size:13px;line-height:1.35">No fim de cada rodada, mostra as suas escolhas e qual era a melhor.</span>
      </span>
      <span class="chave"><span></span></span>
    </button>
    <p class="suave" style="font-size:14px;line-height:1.45">${dica}</p>
    <button class="botao principal empurra" data-acao="comecar">Começar</button>
  </section>`;
}

// ---------- Tela: Mesa ----------

function telaMesa() {
  const p = estado.partida;
  const eu = p.jogadores[VOCE];
  const minhaVez = p.vez === VOCE;
  const comprando = minhaVez && p.fase === 'comprar';
  const batendo = minhaVez && p.fase === 'batendo';
  const jogando = minhaVez && (p.fase === 'jogar' || batendo);
  const sel = estado.selecionadas.map(id => eu.mao.find(c => c.id === id)).filter(Boolean);
  const { curinga } = p;
  const normal = { curinga };
  const naBatida = { curinga, podePonta: true };
  // Baixar: com curinga na ponta também vale, mas aí a jogada vira batida.
  const jogoSemPonta = jogando && sel.length >= 3 ? analisarJogo(sel, normal) : null;
  const jogoValido = jogoSemPonta ?? (jogando && sel.length >= 3 ? analisarJogo(sel, naBatida) : null);
  const soParaBater = jogoValido && !jogoSemPonta;
  // Num jogo da mesa: encaixar (normal ou com curinga na ponta) ou trocar o curinga.
  const cabeEm = jogo => {
    if (!jogando || sel.length === 0) return null;
    if (analisarEncaixe(jogo, sel, normal)) return 'encaixe';
    if (sel.length === 1 && lugarDoCuringa(jogo, sel[0]) >= 0) return 'troca';
    if (analisarEncaixe(jogo, sel, naBatida)) return 'ponta';
    return null;
  };
  const jeitos = p.mesa.map(cabeEm);
  const algumCabe = jeitos.some(Boolean);
  const doLixo = jogando && p.cartaDoLixo ? eu.mao.find(c => c.id === p.cartaDoLixo) : null;

  // O aviso do meio diz o que fazer agora.
  let aviso = { texto: 'Escolha cartas para baixar ou descartar', classe: '' };
  if (!minhaVez && p.fase === 'batendo') aviso = { texto: `${nome(p.vez)} pegou do lixo e vai tentar bater!`, classe: 'ouro' };
  else if (!minhaVez) aviso = { texto: `${nome(p.vez)} está jogando…`, classe: 'espera' };
  else if (comprando && eu.queimado) aviso = { texto: 'Você está queimado: compre do monte', classe: 'ouro' };
  else if (comprando) aviso = { texto: 'Sua vez: compre do monte ou do lixo', classe: 'ouro' };
  else if (soParaBater && !batendo) aviso = { texto: 'Curinga na ponta só vale para bater!', classe: 'ouro' };
  else if (jogoValido) aviso = { texto: jogoValido.tipo === 'sequencia' ? 'É uma sequência: pode baixar!' : 'É uma trinca: pode baixar!', classe: 'ouro' };
  else if (jeitos.includes('troca') && !batendo) aviso = { texto: 'Trocar pelo curinga só vale para bater!', classe: 'ouro' };
  else if (jeitos.includes('ponta') && !batendo) aviso = { texto: 'Curinga na ponta só vale para bater!', classe: 'ouro' };
  else if (algumCabe) aviso = { texto: 'Toque no jogo que brilha', classe: 'ouro' };
  else if (batendo) aviso = { texto: 'Agora você precisa bater: coloque todas as cartas na mesa!', classe: 'ouro' };
  else if (doLixo) aviso = { texto: `Use o <span class="carta-texto${ehVermelha(doLixo) ? '' : ' preta'}">${textoDaCarta(doLixo)}</span> num jogo nesta vez`, classe: 'ouro' };
  else if (sel.length === 1) aviso = { texto: 'Pode descartar essa carta', classe: '' };
  else if (sel.length > 1) aviso = { texto: 'Essas cartas não formam um jogo', classe: 'erro' };

  const outros = p.jogadores.filter(j => j.id !== VOCE);
  // Largura que sobra para o leque de cada robô (1 robô ocupa a linha toda).
  const larguraDoLeque = outros.length === 1 ? 300 : outros.length === 2 ? 140 : 88;
  const rivais = outros.map(j => {
    const n = j.mao.length;
    const sobrepor = n > 1 ? Math.min(3, Math.floor((larguraDoLeque - 22 * n) / (n - 1))) : 0;
    const costas = j.mao.map((_, i) => `<span class="carta micro verso" style="${i ? `margin-left:${sobrepor}px` : ''}"></span>`).join('');
    return `
    <div class="rival${p.vez === j.id ? ' da-vez' : ''}" data-jogador="${j.id}">
      <div class="topo">
        ${avatar(j.id, outros.length === 3 ? 28 : 38)}
        <div class="info">
          <span class="nome">${j.nome}</span>
          <span class="suave pequeno">${j.situacao === 'fora' ? 'saiu' : `${n} ${n === 1 ? 'carta' : 'cartas'}`}</span>
          ${j.queimado ? '<span class="selo-queimado">queimado</span>' : ''}
        </div>
      </div>
      <div class="leque-rival" aria-hidden="true">${costas}</div>
    </div>`;
  }).join('');

  const jogos = p.mesa.map((jogo, k) => {
    const cabe = jeitos.at(k);
    const sobrepor = jogo.cartas.length > 3 ? Math.max(-22, Math.floor((140 - 34 * jogo.cartas.length) / (jogo.cartas.length - 1))) : 4;
    const cartas = jogo.cartas.map((c, i) => carta(c, {
      tamanho: 'pequena', estilo: i ? `margin-left:${sobrepor}px` : '', curinga: c.id in (jogo.curingas ?? {}),
    })).join('');
    const dono = jogo.dono === VOCE ? 'você' : nome(jogo.dono);
    return `<button class="jogo${cabe ? ' brilha' : ''}" data-acao="jogo" data-jogo="${jogo.id}" aria-label="Jogo de ${dono}${cabe ? ': toque para encaixar' : ''}">
      <div class="cartas">${cartas}</div><span class="suave pequeno">de ${dono}</span></button>`;
  }).join('');

  const deCima = p.lixo.at(-1);
  // Fora da sua vez, o lixo fica disponível para o pifado (3 ou mais jogadores).
  const podeLixo = (comprando && deCima && !eu.queimado) || podeAmeacar(p, VOCE);
  const lixoBrilha = comprando && deCima && !eu.queimado;
  // A carta virada fica atravessada embaixo do monte, à vista.
  const monte = `<button class="pilha pilha-monte" data-acao="monte" ${comprando ? '' : 'disabled'} aria-label="Comprar do monte">
      <span class="monte-e-virada">${carta(p.virada, { tamanho: 'grande', classes: 'virada' })}<span class="carta grande verso${comprando ? ' brilha' : ''}"></span></span>
      Monte · ${p.monte.length}</button>`;
  const lixo = `<button class="pilha pilha-lixo" data-acao="lixo" ${podeLixo ? '' : 'disabled'} aria-label="Comprar do lixo">
      ${deCima ? carta(deCima, { tamanho: 'grande', classes: lixoBrilha ? 'brilha' : '', curinga: ehCuringa(curinga, deCima) }) : '<span class="carta grande vazio"></span>'}${eu.queimado ? 'Lixo · <span class="selo-queimado">queimado</span>' : 'Lixo'}</button>`;

  const mao = maoOrdenada(eu.mao);
  const sobrepor = mao.length > 1 ? Math.min(4, Math.floor((358 - 56 * mao.length) / (mao.length - 1))) : 0;
  const cartasDaMao = mao.map((c, i) => {
    const classes = [estado.selecionadas.includes(c.id) ? 'escolhida' : '', c.id === p.cartaDoLixo ? 'do-lixo' : ''].join(' ');
    const etiqueta = c.id === p.cartaDoLixo ? '<span class="etiqueta">do lixo</span>' : '';
    return carta(c, { botao: true, classes, estilo: i ? `margin-left:${sobrepor}px` : '', extra: etiqueta, curinga: ehCuringa(curinga, c) });
  }).join('');

  const podeDevolver = doLixo && !p.jogouNestaVez && !batendo;
  // Batendo fora da vez, só dá para descartar a última carta.
  const podeDescartar = jogando && sel.length === 1 && (!batendo || eu.mao.length === 1);
  const segundoBotao = podeDevolver
    ? '<button class="botao forte" data-acao="devolver">Devolver ao lixo</button>'
    : `<button class="botao forte" data-acao="descartar" ${podeDescartar ? '' : 'disabled'}>Descartar</button>`;
  const textoDesistir = p.tentativa?.tipo === 'pifado' ? 'Não consigo bater (fico queimado)' : 'Desfazer: não consigo bater';
  const desistir = batendo ? `<button class="botao" style="grid-column:1/-1" data-acao="desistir">${textoDesistir}</button>` : '';

  return `
  <section class="tela">
    <div class="barra-topo">
      <button class="icone" data-acao="menu" aria-label="Menu">${ICONES.menu}</button>
      <span style="font-weight:700;font-size:16px">Rodada ${p.rodada}</span>
      <span class="pilula">Seus pontos: ${eu.pontos}</span>
    </div>
    <div class="rivais r${outros.length}">${rivais}</div>
    <div class="area-jogos">
      <span class="rotulo">JOGOS NA MESA</span>
      ${p.mesa.length ? `<div class="jogos">${jogos}</div>` : '<span class="suave pequeno">Ninguém baixou jogos ainda.</span>'}
    </div>
    <div class="pilhas">${monte}${lixo}</div>
    <p class="legenda-curinga">Curinga desta rodada: <strong>${nomeDoValor(curinga.valor)} ${curinga.cor === 'preta' ? '♠ ♣' : '♥ ♦'}</strong></p>
    <div class="aviso ${aviso.classe}" aria-live="polite">${aviso.texto}</div>
    <div class="mao${minhaVez ? '' : ' esperando'}">${cartasDaMao}</div>
    <div class="botoes">
      <button class="botao principal" style="font-size:16px;min-height:52px" data-acao="baixar" ${jogoValido ? '' : 'disabled'}>Baixar jogo</button>
      ${segundoBotao}
      ${desistir}
    </div>
    <div class="rodape">
      <span>Na mão: <strong>${pontosNaMao(eu.mao, curinga)} pts</strong></span>
      <button class="botao" style="min-height:44px;font-size:14px" data-acao="organizar">${ICONES.organizar} ${estado.ordem === 'naipe' ? 'Por número' : 'Por naipe'}</button>
    </div>
  </section>`;
}

// ---------- Tela: Fim da rodada ----------

function telaFimRodada() {
  const p = estado.partida;
  const { quemBateu, somou } = p.ultimaRodada;
  const titulo = quemBateu === null ? 'O monte acabou!' : quemBateu === VOCE ? 'Você bateu!' : `${nome(quemBateu)} bateu!`;
  const subtitulo = quemBateu === null ? 'Todo mundo soma o que ficou na mão' : 'Cada um soma o que ficou na mão';

  const linhas = p.jogadores.filter(j => j.id in somou).map(j => {
    const bateu = j.id === quemBateu;
    const perigo = j.pontos >= 70;
    const situacao = j.situacao === 'fora' ? ' · saiu' : j.situacao === 'estourou' ? ' · estourou' : '';
    return `
    <div class="linha-placar${bateu ? ' bateu' : ''}">
      <div class="topo">
        ${avatar(j.id, 36)}
        <span class="nome">${j.id === VOCE ? 'Você' : j.nome}<span class="suave pequeno">${situacao}</span></span>
        <span style="font-weight:700;color:${bateu ? 'var(--ouro)' : 'var(--laranja)'}">${bateu ? 'bateu' : '+' + somou[j.id]}${p.ultimaRodada.castigos?.[j.id] ? `<span class="suave pequeno"> (inclui ${p.ultimaRodada.castigos[j.id]} do curinga)</span>` : ''}</span>
        <span class="total">${j.pontos}</span>
      </div>
      ${j.mao.length && !bateu ? `<div class="sobra">${j.mao.map(c => carta(c, { tamanho: 'mini' })).join('')}</div>` : ''}
      <div class="progresso">
        <div class="trilho"><div class="cheio${perigo ? ' perigo' : ''}" style="width:${Math.min(j.pontos, 100)}%"></div></div>
        <span class="suave pequeno" style="min-width:52px;text-align:right">${j.pontos} / 100</span>
      </div>
    </div>`;
  }).join('');

  const acabou = p.fase === 'fimDoJogo' || p.jogadores[VOCE].situacao === 'fora';
  return `
  <section class="tela resultado">
    <div class="cabecalho">
      <span class="rotulo">FIM DA RODADA ${p.rodada}</span>
      <h1>${titulo}</h1>
      <span class="suave" style="font-size:15px">${subtitulo}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">${linhas}</div>
    ${quadroDoTreinador(registroDaRodada(p.rodada))}
    <button class="botao principal empurra" data-acao="proxima">${acabou ? 'Ver resultado' : 'Próxima rodada'}</button>
  </section>`;
}

// ---------- Tela: Fim do jogo ----------

function telaFimJogo() {
  const p = estado.partida;
  const venceu = p.vencedor === VOCE;
  const titulo = venceu ? 'Você venceu!' : p.vencedor !== null ? `${nome(p.vencedor)} venceu` : 'Você saiu da partida';
  const ordem = [...p.jogadores].sort((a, b) => {
    if (a.id === p.vencedor) return -1;
    if (b.id === p.vencedor) return 1;
    return (estado.saiuNaRodada[b.id] ?? Infinity) - (estado.saiuNaRodada[a.id] ?? Infinity);
  });
  const ranking = ordem.map((j, i) => `
    <div class="ranking${i === 0 ? ' primeiro' : ''}">
      <span style="width:28px;font-weight:800;font-size:18px;color:${i === 0 ? 'var(--ouro)' : 'var(--texto-suave)'}">${i + 1}º</span>
      ${avatar(j.id, 36)}
      <span style="flex:1;font-weight:700;font-size:17px">${j.id === VOCE ? 'Você' : j.nome}</span>
      <span class="suave" style="font-size:14px">${j.id in estado.saiuNaRodada ? `saiu na rodada ${estado.saiuNaRodada[j.id]}` : `${j.pontos} pts`}</span>
    </div>`).join('');

  return `
  <section class="tela resultado" style="align-items:center;padding-top:64px">
    <div class="trofeu">${ICONES.trofeu}</div>
    <h1 style="font-size:36px;font-weight:800;text-align:center">${titulo}</h1>
    <div style="width:100%;display:flex;flex-direction:column;gap:10px">${ranking}</div>
    <div class="numeros" style="width:100%">
      <div class="numero"><strong>${p.rodada}</strong><span class="suave pequeno">rodadas</span></div>
      <div class="numero"><strong>${estado.vezesQueBateu}</strong><span class="suave pequeno">vezes que você bateu</span></div>
      <div class="numero"><strong>${p.jogadores[VOCE].voltas}</strong><span class="suave pequeno">voltas usadas</span></div>
    </div>
    <div style="width:100%;display:flex;flex-direction:column;gap:10px" class="empurra">
      ${estado.treinador && estado.treino.some(r => r.escolhas.length) ? '<button class="botao forte" style="border-color:var(--ouro);color:var(--ouro)" data-acao="verRelatorio">Relatório do treinador</button>' : ''}
      <button class="botao principal" data-acao="comecar">Jogar de novo</button>
      <button class="botao" data-acao="inicio">Início</button>
    </div>
  </section>`;
}

// ---------- Telas do treinador ----------

const SELOS = {
  boa: { icone: '✓', classe: 'boa', nome: 'boas' },
  'empate técnico': { icone: '≈', classe: 'empate', nome: 'empate técnico' },
  ok: { icone: '~', classe: 'ok', nome: 'ok' },
  'dava melhor': { icone: '✗', classe: 'ruim', nome: 'dava melhor' },
};
const emPontos = x => (x * 100).toFixed(1).replace('.', ',');
const porcento = x => `${Math.round(x * 100)}%`;
const umaCasa = x => x.toFixed(1).replace('.', ',');
// Só conta como chance perdida o que é erro de verdade (ok e dava melhor).
const custoReal = analise => (analise.selo === 'ok' || analise.selo === 'dava melhor' ? analise.custo : 0);

function seloDaEscolha(escolha) {
  if (!escolha.analise) return '<span class="selo-icone pendente" aria-label="analisando">…</span>';
  const selo = SELOS[escolha.analise.selo];
  return `<span class="selo-icone ${selo.classe}" aria-label="${escolha.analise.selo}">${selo.icone}</span>`;
}

function barraDeProgresso(registro, texto) {
  if (registro.pronta) return '';
  const feitas = registro.escolhas.filter(e => e.analise).length;
  return `
    <div class="progresso-treino">
      <div class="suave pequeno" style="display:flex;justify-content:space-between"><span>${texto}</span><span>${feitas} de ${registro.escolhas.length}</span></div>
      <div class="trilho"><div class="cheio" style="width:${Math.round((registro.progresso ?? 0) * 100)}%"></div></div>
    </div>`;
}

// O quadro do treinador no fim da rodada.
function quadroDoTreinador(registro) {
  if (!estado.treinador) return '';
  const total = registro.escolhas.length;
  let corpo;
  if (!total) {
    corpo = '<p class="suave" style="font-size:14px">Nesta rodada você não teve escolhas com mais de uma opção para analisar.</p>';
  } else if (registro.indisponivel || registro.erro) {
    corpo = '<p class="suave" style="font-size:14px">Não deu para analisar neste aparelho. Tente atualizar o navegador.</p>';
  } else {
    const feitas = registro.escolhas.filter(e => e.analise);
    const contagem = Object.entries(SELOS).map(([chave, selo]) =>
      `<div class="contagem-selo"><span class="${selo.classe}">${selo.icone} ${feitas.filter(e => e.analise.selo === chave).length}</span><span class="suave pequeno">${selo.nome}</span></div>`).join('');
    const pior = [...feitas].filter(e => custoReal(e.analise) > 0).sort((a, b) => b.analise.custo - a.analise.custo)[0];
    corpo = `
      ${barraDeProgresso(registro, 'Analisando as suas escolhas…')}
      <div class="selos-treino">${contagem}</div>
      ${pior ? `<p style="font-size:14px;line-height:1.45">A escolha que mais custou: <strong style="color:var(--laranja)">${pior.texto.toLowerCase()}</strong> (−${emPontos(pior.analise.custo)} pontos de chance).</p>` : ''}
      <button class="botao forte" style="border-color:var(--ouro);color:var(--ouro)" data-acao="verAnalise" data-rodada="${registro.rodada}">Ver análise</button>`;
  }
  return `
    <div class="quadro-treino">
      <div style="display:flex;align-items:center;gap:10px">
        ${ICONES.treino}<span style="font-size:17px;font-weight:700">Treinador</span>
        <span class="suave" style="margin-left:auto;font-size:13px">${total} ${total === 1 ? 'escolha' : 'escolhas'}</span>
      </div>
      ${corpo}
    </div>`;
}

function cabecalhoDoTreino(acao, titulo, subtitulo) {
  return `
    <div class="barra-topo" style="justify-content:flex-start;gap:8px">
      <button class="icone" data-acao="${acao}" aria-label="Voltar">${ICONES.voltar}</button>
      <div style="display:flex;flex-direction:column">
        <h1 style="font-size:20px;font-weight:700">${titulo}</h1>
        ${subtitulo ? `<span class="suave" style="font-size:13px">${subtitulo}</span>` : ''}
      </div>
    </div>`;
}

// Lista das escolhas de uma rodada.
function telaAnalise() {
  const registro = estado.treino.find(r => r.rodada === estado.rodadaVista);
  const todas = registro.escolhas.map((escolha, i) => ({ escolha, i }));
  const paraMelhorar = todas.filter(({ escolha }) => escolha.analise && custoReal(escolha.analise) > 0);
  const lista = estado.filtroTreino === 'todas' ? todas : paraMelhorar;
  const perdida = todas.reduce((soma, { escolha }) => soma + (escolha.analise ? custoReal(escolha.analise) : 0), 0);
  const filtro = (f, rotulo) =>
    `<button class="filtro${estado.filtroTreino === f ? ' ativo' : ''}" data-acao="filtrarTreino" data-f="${f}" aria-pressed="${estado.filtroTreino === f}">${rotulo}</button>`;
  const itens = lista.map(({ escolha, i }) => {
    const ruim = escolha.analise?.selo === 'dava melhor';
    const custo = escolha.analise ? `−${emPontos(custoReal(escolha.analise))}` : '';
    return `
      <button class="item-treino${ruim ? ' ruim' : ''}" data-acao="verEscolha" data-i="${i}" ${escolha.analise ? '' : 'disabled'}>
        ${seloDaEscolha(escolha)}
        <span style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;text-align:left">
          <span class="suave pequeno">${escolha.quando}</span>
          <span style="font-size:15px;font-weight:600">${escolha.texto}</span>
        </span>
        <span class="custo-treino${ruim ? ' ruim' : ''}">${escolha.analise ? custo : 'analisando…'}</span>
      </button>`;
  }).join('');
  return `
  <section class="tela">
    ${cabecalhoDoTreino('voltarTreino', `Análise da rodada ${registro.rodada}`, `Chance de vencer perdida: ${emPontos(perdida)} pontos`)}
    ${barraDeProgresso(registro, 'Analisando…')}
    <div style="display:flex;gap:8px">${filtro('todas', `Todas (${todas.length})`)}${filtro('melhorar', `Para melhorar (${paraMelhorar.length})`)}</div>
    <div style="display:flex;flex-direction:column;gap:8px">${itens || '<p class="suave">Nenhuma escolha aqui.</p>'}</div>
    <p class="suave pequeno" style="margin-top:auto;line-height:1.4">Os números são estimativas: cada opção foi jogada até ${SIMULACOES_DO_TREINO} vezes, com robôs Espertos no lugar de todo mundo.</p>
  </section>`;
}

// Detalhe de uma escolha: a mão naquela hora, as opções lado a lado e o porquê.
function telaDetalhe() {
  const registro = estado.treino.find(r => r.rodada === estado.rodadaVista);
  const { decisao, analise, explicacao, quando } = registro.escolhas[estado.escolhaVista];
  const foto = decisao.foto;
  const ids = opcao => [opcao.acao.cartaId, ...(opcao.acao.ids ?? [])].filter(Boolean);
  const minhas = ids(decisao.opcoes[analise.escolhida]);
  const melhores = analise.melhor === analise.escolhida ? [] : ids(decisao.opcoes[analise.melhor]);
  const mao = ordenarPor(foto.jogadores[VOCE].mao, estado.ordem).map(c => {
    const marca = melhores.includes(c.id) ? 'melhor' : minhas.includes(c.id) ? 'você' : '';
    const etiqueta = marca ? `<span class="etiqueta ${marca === 'melhor' ? '' : 'sua'}">${marca}</span>` : '';
    return carta(c, { tamanho: 'pequena', classes: marca ? `marcada ${marca === 'melhor' ? 'melhor' : 'sua'}` : '', extra: etiqueta, curinga: ehCuringa(foto.curinga, c) });
  }).join('');
  const lixo = decisao.tipo === 'compra' && foto.lixo.at(-1)
    ? `<span class="suave pequeno">Lixo:</span>${carta(foto.lixo.at(-1), { tamanho: 'pequena' })}` : '';
  const placar = jogadoresAtivos(foto).map(j => `${j.id === VOCE ? 'você' : j.nome} ${j.pontos}`).join(' · ');

  const maior = Math.max(...analise.opcoes.map(o => o.chance), 0.01);
  const ordem = [...analise.opcoes.keys()].sort((a, b) =>
    Number(analise.opcoes[b].finalista) - Number(analise.opcoes[a].finalista) || analise.opcoes[b].chance - analise.opcoes[a].chance);
  const barras = ordem.map(i => {
    const o = analise.opcoes[i];
    const tag = i === analise.melhor ? '<span class="tag melhor">melhor</span>' : i === analise.escolhida ? '<span class="tag sua">sua escolha</span>' : '';
    const classe = i === analise.melhor ? 'melhor' : i === analise.escolhida ? 'sua' : o.finalista ? '' : 'cedo';
    return `
      <div class="opcao-treino ${classe}">
        <div style="display:flex;align-items:center;gap:6px;font-size:14px"><span style="font-weight:600">${o.rotulo}</span>${tag}<strong style="margin-left:auto">${porcento(o.chance)}</strong></div>
        <div class="trilho"><div class="cheio" style="width:${Math.round((o.chance / maior) * 100)}%"></div></div>
      </div>`;
  }).join('');
  const temCedo = analise.opcoes.some(o => !o.finalista);
  const minha = analise.opcoes[analise.escolhida];
  const melhor = analise.opcoes[analise.melhor];
  const numero = (rotulo, a, b) => `
    <div class="numero-treino"><span class="suave pequeno">${rotulo}</span>
      ${analise.melhor === analise.escolhida ? `<strong>${a}</strong>` : `<span><strong>${a}</strong> → <strong style="color:var(--ouro)">${b}</strong></span><span class="suave" style="font-size:11px">sua escolha → melhor</span>`}
    </div>`;
  const selo = SELOS[analise.selo];
  return `
  <section class="tela detalhe-treino">
    ${cabecalhoDoTreino('voltarAnalise', NOMES_DOS_TIPOS[decisao.tipo], `Rodada ${registro.rodada} · ${quando.split(' · ')[0]}`)}
    <div class="mao-na-hora">
      <div class="suave pequeno" style="display:flex;justify-content:space-between;gap:8px"><span>COMO ESTAVA A SUA MÃO</span><span>${placar}</span></div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding-top:14px">${mao}${lixo}</div>
    </div>
    <div class="titulo-treino ${selo.classe}"><span class="selo-icone ${selo.classe}">${selo.icone}</span><p>${explicacao.titulo}</p></div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <span class="rotulo">CHANCE DE VENCER COM CADA OPÇÃO</span>
      ${barras}
      ${temCedo ? '<span class="suave pequeno">Em cinza: opções deixadas de lado cedo, com menos simulações.</span>' : ''}
    </div>
    <div class="numeros-treino">
      ${numero('Pontos esperados na rodada', umaCasa(minha.pontosEsperados), umaCasa(melhor.pontosEsperados))}
      ${numero('Chance de você bater', porcento(minha.chanceDeBater), porcento(melhor.chanceDeBater))}
    </div>
    ${explicacao.porque.length ? `<div class="bloco-treino"><span class="rotulo">POR QUÊ</span>${explicacao.porque.map(f => `<p class="frase-porque">${f}</p>`).join('')}</div>` : ''}
    ${explicacao.mao.length ? `<div class="bloco-treino"><span class="rotulo">SUA MÃO NAQUELA HORA</span>${explicacao.mao.map(f => `<p class="frase-mao">· ${f}</p>`).join('')}</div>` : ''}
    ${explicacao.margem ? `<p class="suave pequeno" style="margin-top:auto">${explicacao.margem}</p>` : ''}
  </section>`;
}

// Relatório do treinador no fim da partida.
function telaRelatorio() {
  const analisadas = estado.treino.flatMap(r => r.escolhas).filter(e => e.analise);
  const pendentes = estado.treino.flatMap(r => r.escolhas).filter(e => !e.analise).length;
  const boas = analisadas.filter(e => e.analise.selo === 'boa' || e.analise.selo === 'empate técnico').length;
  const perdida = analisadas.reduce((soma, e) => soma + custoReal(e.analise), 0);
  const tipos = ['compra', 'descarte', 'baixar'].map(tipo => {
    const doTipo = analisadas.filter(e => e.decisao.tipo === tipo);
    if (!doTipo.length) return '';
    const pct = doTipo.filter(e => e.analise.selo === 'boa' || e.analise.selo === 'empate técnico').length / doTipo.length;
    const cor = pct >= 0.75 ? 'var(--verde-bom)' : pct >= 0.6 ? 'var(--ouro)' : 'var(--laranja)';
    return `
      <div class="opcao-treino">
        <div style="display:flex;justify-content:space-between;font-size:14px"><span style="font-weight:600">${NOMES_DOS_TIPOS[tipo]}</span><span><strong>${porcento(pct)}</strong><span class="suave"> de ${doTipo.length} ${doTipo.length === 1 ? 'escolha' : 'escolhas'}</span></span></div>
        <div class="trilho"><div class="cheio" style="width:${Math.round(pct * 100)}%;background:${cor}"></div></div>
      </div>`;
  }).join('');
  const padroes = errosQueMaisSeRepetem(analisadas).slice(0, 3).map(e =>
    `<div style="display:flex;gap:10px"><span style="font-weight:800;color:var(--laranja)">${e.vezes}×</span><span style="font-size:14px;line-height:1.45">${e.texto}</span></div>`).join('');
  const rodadas = estado.treino.filter(r => r.escolhas.length).map(r =>
    `<button class="filtro" data-acao="verAnalise" data-rodada="${r.rodada}">Rodada ${r.rodada}</button>`).join('');
  return `
  <section class="tela">
    <div style="display:flex;flex-direction:column;gap:4px;padding-top:16px">
      <span class="rotulo">FIM DA PARTIDA · ${estado.partida.rodada} RODADAS</span>
      <h1 style="font-size:28px;font-weight:800">Relatório do treinador</h1>
      ${pendentes ? `<span class="suave pequeno">Ainda analisando ${pendentes} ${pendentes === 1 ? 'escolha' : 'escolhas'}…</span>` : ''}
    </div>
    <div class="numeros">
      <div class="numero"><strong>${analisadas.length}</strong><span class="suave pequeno">escolhas</span></div>
      <div class="numero"><strong style="color:var(--verde-bom)">${analisadas.length ? porcento(boas / analisadas.length) : '–'}</strong><span class="suave pequeno">boas ou empate</span></div>
      <div class="numero"><strong style="color:var(--laranja)">${emPontos(perdida)}</strong><span class="suave pequeno">pontos de chance perdidos</span></div>
    </div>
    ${tipos ? `<div style="display:flex;flex-direction:column;gap:12px"><span class="rotulo">ESCOLHAS BOAS POR TIPO</span>${tipos}</div>` : ''}
    ${padroes ? `<div class="quadro-treino" style="border-color:transparent"><span class="rotulo">O QUE MAIS SE REPETE</span>${padroes}</div>` : ''}
    ${rodadas ? `<div style="display:flex;flex-direction:column;gap:8px"><span class="rotulo">VER RODADA POR RODADA</span><div style="display:flex;flex-wrap:wrap;gap:8px">${rodadas}</div></div>` : ''}
    <div class="empurra" style="display:flex;flex-direction:column;gap:10px">
      <button class="botao principal" data-acao="comecar">Jogar de novo</button>
      <button class="botao" data-acao="inicio">Início</button>
    </div>
  </section>`;
}

// ---------- Janelas por cima ----------

function modalMenu() {
  return `
  <div class="fundo-modal">
    <div class="modal" role="dialog" aria-label="Menu">
      <h2 style="font-size:24px;font-weight:800">Menu</h2>
      <div class="botoes-modal">
        <button class="interruptor-treino${preferencias.som ? ' ligado' : ''}" data-acao="alternarSom" role="switch" aria-checked="${preferencias.som}">
          <span style="flex:1;text-align:left;font-size:16px;font-weight:700">Som</span><span class="chave"><span></span></span>
        </button>
        <button class="interruptor-treino${preferencias.vibrar ? ' ligado' : ''}" data-acao="alternarVibrar" role="switch" aria-checked="${preferencias.vibrar}">
          <span style="flex:1;text-align:left;font-size:16px;font-weight:700">Vibrar</span><span class="chave"><span></span></span>
        </button>
        <button class="botao principal" data-acao="fecharMenu">Continuar</button>
        <button class="botao" data-acao="comecar">Recomeçar partida</button>
        <button class="botao" data-acao="inicio">Sair para o início</button>
      </div>
    </div>
  </div>`;
}

function modalEstourou() {
  const p = estado.partida;
  const salvos = jogadoresAtivos(p);
  const maior = salvos.reduce((a, b) => (b.pontos > a.pontos ? b : a));
  return `
  <div class="fundo-modal">
    <div class="modal" role="dialog" aria-labelledby="titulo-estouro">
      <div style="width:64px;height:64px;border-radius:50%;background:rgba(240,138,75,.16);display:flex;align-items:center;justify-content:center">${ICONES.estouro}</div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <h2 id="titulo-estouro" style="font-size:28px;font-weight:800">Você estourou!</h2>
        <span style="font-size:16px;color:var(--laranja);font-weight:700">${p.jogadores[VOCE].pontos} pontos</span>
      </div>
      <div class="caixa-destaque">
        <span style="font-size:15px">Voltar para o jogo com</span>
        <span style="font-size:36px;font-weight:800;color:var(--ouro);line-height:1">${maior.pontos} pts</span>
        <span class="suave" style="font-size:13px">os pontos de ${maior.id === VOCE ? 'você' : maior.nome}, que tem mais entre quem ficou</span>
      </div>
      <div class="botoes-modal">
        <button class="botao principal" data-acao="voltar">Voltar</button>
        <button class="botao" data-acao="naoVoltar">Sair da partida</button>
      </div>
    </div>
  </div>`;
}

// ---------- Desenhar ----------

function render() {
  // Enquanto você arrasta uma carta, a tela espera você soltar para se atualizar.
  if (arrasto?.movendo) return; // soltar() desenha de novo
  const telas = {
    inicio: telaInicio, novaPartida: telaNovaPartida, mesa: telaMesa, fimRodada: telaFimRodada, fimJogo: telaFimJogo,
    analise: telaAnalise, detalhe: telaDetalhe, relatorio: telaRelatorio,
  };
  const p = estado.partida;
  const estourei = p && p.fase === 'decidirVolta' && p.jogadores[VOCE].situacao === 'estourou';
  app.innerHTML = telas[estado.tela]()
    + (estado.menuAberto ? modalMenu() : '')
    + (estado.tela === 'fimRodada' && estourei ? modalEstourou() : '');
}

let timerDoAviso;
function mostrarAviso(texto) {
  toast.innerHTML = `${ICONES.alerta}<span>${texto}</span>`;
  toast.hidden = false;
  clearTimeout(timerDoAviso);
  timerDoAviso = setTimeout(() => { toast.hidden = true; }, 3000);
}

// Depois de qualquer jogada: confere se a rodada acabou, desenha, anima e chama o robô.
async function depoisDaAcao(animar) {
  const p = estado.partida;
  if (estado.tela === 'mesa' && ['decidirVolta', 'fimDaRodada', 'fimDoJogo'].includes(p.fase)) {
    // Os robôs sempre escolhem voltar.
    for (const j of p.jogadores) {
      if (j.id !== VOCE && j.situacao === 'estourou') decidirVolta(p, j.id, true);
    }
    if (p.ultimaRodada.quemBateu === VOCE) estado.vezesQueBateu++;
    estado.selecionadas = [];
    estado.tela = 'fimRodada';
    iniciarAnalise(registroDaRodada(p.rodada));
    const eu = p.jogadores[VOCE];
    if (eu.situacao !== 'jogando' || eu.pontos >= p.config.limite) tocar('estourou');
    else if (p.ultimaRodada.quemBateu === VOCE) tocar('bati');
    else tocar('bateuOutro');
  }
  for (const j of p.jogadores) {
    if (j.situacao === 'fora' && !(j.id in estado.saiuNaRodada)) estado.saiuNaRodada[j.id] = p.rodada;
  }
  render();
  if (animar && estado.tela === 'mesa') {
    // Enquanto as cartas voam, ninguém joga (nem você, nem o robô).
    estado.animando = true;
    try {
      await animar();
    } catch (erro) {
      console.error('Animação falhou (o jogo segue):', erro);
    } finally {
      estado.animando = false;
    }
  }
  // Sininho quando chega a sua vez (uma vez só por vez).
  if (estado.tela === 'mesa' && p.vez === VOCE && p.fase === 'comprar') {
    if (!estado.avisouSuaVez) tocar('suaVez');
    estado.avisouSuaVez = true;
  } else if (p.vez !== VOCE) {
    estado.avisouSuaVez = false;
  }
  vigiarLixo();
  vezDoRobo();
}

// Pifado: quando muda a carta de cima do lixo, os robôs olham se batem com ela.
function vigiarLixo() {
  const p = estado.partida;
  const deCima = p.lixo.at(-1);
  if (estado.tela !== 'mesa' || !deCima || deCima.id === estado.lixoVisto) return;
  estado.lixoVisto = deCima.id;
  setTimeout(() => {
    if (estado.partida !== p || estado.tela !== 'mesa') return;
    if (estado.menuAberto || estado.animando) {
      estado.lixoVisto = null; // não deu para olhar agora: olha de novo depois
      return;
    }
    if (p.lixo.at(-1)?.id !== deCima.id) return;
    for (const j of p.jogadores) {
      if (j.id === VOCE || !podeAmeacar(p, j.id)) continue;
      const plano = planoParaBater(p, j.id, deCima);
      if (!plano) continue;
      const animar = animacaoDoRobo(p, j.id, { tipo: 'comprarDoLixo' });
      ameacarBater(p, j.id);
      tocar('comprar', { vibrar: false });
      depoisDaAcao(animar);
      return;
    }
  }, REACAO_DO_ROBO);
}

const SOM_DA_JOGADA = {
  comprarDoMonte: 'comprar', comprarDoLixo: 'comprar', ameacar: 'comprar',
  descartar: 'descartar', baixarJogo: 'baixar', encaixar: 'baixar', trocarCuringa: 'baixar',
};

function vezDoRobo() {
  const ficha = ++estado.fichaDoRobo;
  const p = estado.partida;
  if (estado.tela !== 'mesa' || estado.menuAberto || p.vez === null || p.vez === VOCE) return;
  setTimeout(() => {
    // Só joga se nada mudou enquanto esperava (ex.: você abriu o menu, saiu,
    // ou alguém pegou do lixo para bater).
    if (ficha !== estado.fichaDoRobo || estado.partida !== p || estado.tela !== 'mesa' || estado.menuAberto || estado.animando || p.vez === VOCE) return;
    const id = p.vez;
    try {
      const acao = proximaAcao(p, id, estado.nivel);
      const animar = animacaoDoRobo(p, id, acao);
      const resultado = executarAcao(p, id, acao);
      tocar(SOM_DA_JOGADA[acao.tipo], { vibrar: false }); // robô: só som, sem vibrar
      depoisDaAcao(animar && (() => animar(resultado)));
    } catch (erro) {
      console.error('O robô se atrapalhou:', erro);
      socorroDoRobo(p, id);
    }
  }, PAUSA_DO_ROBO);
}

// Rede de segurança: se a jogada do robô der erro, ele tenta a jogada simples do Fácil
// (ou desiste de bater). Se nem assim der, avisa em vez de travar calado.
function socorroDoRobo(p, id) {
  try {
    const acao = p.fase === 'batendo' ? { tipo: 'desistir' } : proximaAcao(p, id, 'facil');
    executarAcao(p, id, acao);
    depoisDaAcao();
  } catch (erro) {
    console.error('Nem a jogada simples deu certo:', erro);
    mostrarAviso('Ops, um robô se atrapalhou. Abra o menu ☰ e recomece a partida.');
  }
}

// Tenta uma jogada sua; se o motor recusar, mostra a mensagem dele (e não anima).
// som: o som da jogada quando ela dá certo (sons.js).
function tentar(jogada, animar, som) {
  try {
    jogada();
    estado.selecionadas = [];
    if (som) tocar(som);
  } catch (erro) {
    if (!(erro instanceof ErroDeJogada)) throw erro;
    mostrarAviso(erro.message);
    tocar('erro');
    animar = null;
  }
  depoisDaAcao(animar);
}

// ---------- Animações das cartas ----------

const VERSO = '<span class="carta verso"></span>';
const DO_MONTE = '.pilha-monte .carta.verso';
const NO_LIXO = '.pilha-lixo .carta';
const naMao = id => `.mao [data-id="${id}"]`;
const costasDe = id => [...document.querySelectorAll(`.rival[data-jogador="${id}"] .leque-rival .carta`)];
const naMesa = (jogoId, cartaId) => `.jogo[data-jogo="${jogoId}"] [data-carta="${cartaId}"]`;

// Começo da rodada: as cartas saem do monte uma por vez, como um carteador.
function animarDistribuicao() {
  const p = estado.partida;
  const de = retangulo(DO_MONTE);
  const minhas = [...document.querySelectorAll('.mao .carta')];
  const ativos = jogadoresAtivos(p);
  const primeiro = ativos.findIndex(j => j.id === p.quemComeca);
  const ordem = [...ativos.slice(primeiro), ...ativos.slice(0, primeiro)];
  const voos = [];
  let atraso = 0;
  for (let i = 0; i < p.config.cartasIniciais; i++) {
    for (const j of ordem) {
      voos.push(j.id === VOCE
        ? voar({ de, para: minhas[i], html: VERSO, atraso, duracao: 320, esconder: true, virar: true })
        : voar({ de, para: costasDe(j.id)[i], html: VERSO, atraso, duracao: 320, esconder: true }));
      const quando = atraso + 300;
      setTimeout(() => tocar('carta', { vibrar: false }), quando); // "tic" quando a carta chega
      atraso += 60;
    }
  }
  voos.push(voar({ de, para: NO_LIXO, html: carta(p.lixo.at(-1), { tamanho: 'grande' }), atraso: atraso + 120, esconder: true }));
  return Promise.all(voos);
}

// Guarda de onde as cartas do robô saem ANTES da jogada mudar a tela.
// Devolve uma função que, depois da jogada, faz as cartas voarem.
function animacaoDoRobo(p, id, acao) {
  const costas = costasDe(id);
  const ultimas = n => costas.slice(-n).map(el => el.getBoundingClientRect());
  const ultimaCosta = () => costasDe(id).at(-1);

  if (acao.tipo === 'comprarDoMonte') {
    const de = retangulo(DO_MONTE);
    return () => voar({ de, para: ultimaCosta(), html: VERSO, esconder: true });
  }
  if (acao.tipo === 'comprarDoLixo') {
    const de = retangulo(NO_LIXO);
    const c = p.lixo.at(-1);
    return () => voar({ de, para: ultimaCosta(), html: carta(c), htmlFinal: VERSO, esconder: true });
  }
  if (acao.tipo === 'descartar') {
    const [de] = ultimas(1);
    const c = p.jogadores[id].mao.find(x => x.id === acao.cartaId);
    return () => voar({ de, para: NO_LIXO, html: VERSO, htmlFinal: carta(c), esconder: true });
  }
  if (acao.tipo === 'baixarJogo' || acao.tipo === 'encaixar') {
    const origens = ultimas(acao.ids.length);
    const cartas = acao.ids.map(cid => p.jogadores[id].mao.find(x => x.id === cid));
    return jogo => Promise.all(cartas.map((c, k) => voar({
      de: origens[k], para: naMesa(jogo.id, c.id), html: VERSO, htmlFinal: carta(c),
      atraso: k * 140, esconder: true,
    })));
  }
  return null;
}

function descartarCarta(id, de = retangulo(naMao(id))) {
  const p = estado.partida;
  const eu = p.jogadores[VOCE];
  // Descartar sem ter baixado nada nesta vez, com jogo na mão = escolheu segurar.
  if (!estado.baixarAnotado && encontrarJogos(eu.mao, p.curinga).length) {
    estado.baixarAnotado = true;
    anotarEscolha('baixar', { tipo: 'descartar', cartaId: id });
  }
  anotarEscolha('descarte', { tipo: 'descartar', cartaId: id });
  const c = eu.mao.find(x => x.id === id);
  const jaEstavaQueimado = eu.queimado;
  tentar(() => descartar(p, VOCE, id), () => voar({ de, para: NO_LIXO, html: carta(c), esconder: true }), 'descartar');
  if (!jaEstavaQueimado && eu.queimado && estado.tela === 'mesa') {
    mostrarAviso('Você se queimou! Essa carta encaixava num jogo da mesa. Até o fim da rodada, só pode comprar do monte.');
    tocar('queimou');
  }
}

// ---------- Treinador: gravar as escolhas e analisar no fim da rodada ----------

const SIMULACOES_DO_TREINO = 120; // por opção; menos que no computador para não demorar no celular
const TELAS_DO_TREINO = ['fimRodada', 'analise', 'detalhe', 'relatorio', 'fimJogo'];
const NOMES_DOS_TIPOS = { compra: 'Monte ou lixo', descarte: 'Descarte', baixar: 'Baixar ou segurar' };

function irParaOTopo() {
  render();
  if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}

function registroDaRodada(rodada) {
  let registro = estado.treino.find(r => r.rodada === rodada);
  if (!registro) {
    registro = { rodada, escolhas: [], pronta: false, iniciada: false };
    estado.treino.push(registro);
  }
  return registro;
}

function novaVezMinha() {
  const p = estado.partida;
  if (p.vez !== VOCE || p.fase !== 'comprar') return;
  estado.vezNaRodada++;
  estado.baixarAnotado = false;
}

// O que a escolha foi, em poucas palavras (para a lista da análise).
function textoDaEscolha(decisao) {
  const acao = decisao.opcoes[decisao.escolhida];
  if (decisao.tipo === 'compra') return acao.acao.tipo === 'comprarDoLixo' ? acao.rotulo.replace('Pegar', 'Pegou') : 'Comprou do monte';
  if (decisao.tipo === 'descarte') return acao.rotulo.replace('Descartar', 'Descartou o');
  return acao.segurar ? 'Segurou os jogos na mão' : acao.rotulo.replace('Baixar', 'Baixou');
}

// Grava a escolha que você vai fazer agora (antes de ela acontecer), se havia mais de uma opção.
function anotarEscolha(tipo, acao) {
  const p = estado.partida;
  if (!estado.treinador || p.vez !== VOCE || p.fase === 'batendo' || p.fase === 'decidirVolta') return;
  const decisao = registrarDecisao(p, VOCE, tipo, acao);
  if (!decisao || decisao.opcoes.length < 2) return;
  registroDaRodada(p.rodada).escolhas.push({
    decisao, analise: null, explicacao: null,
    quando: `Vez ${Math.max(estado.vezNaRodada, 1)} · ${NOMES_DOS_TIPOS[tipo]}`,
    texto: textoDaEscolha(decisao),
  });
}

// Manda as escolhas da rodada para o Web Worker, que simula sem travar a tela.
// Uma análise por vez: as rodadas esperam numa fila (para não esquentar o celular).
const filaDeAnalise = [];
let analiseAtual = null; // { worker, registro }

function iniciarAnalise(registro) {
  if (registro.iniciada) return;
  registro.iniciada = true;
  registro.progresso = 0;
  if (!registro.escolhas.length) { registro.pronta = true; return; }
  if (typeof Worker === 'undefined') { registro.indisponivel = true; registro.pronta = true; return; }
  filaDeAnalise.push(registro);
  analisarProxima();
}

function analisarProxima() {
  if (analiseAtual || !filaDeAnalise.length) return;
  const registro = filaDeAnalise.shift();
  const worker = new Worker(new URL('./treinador-worker.js', import.meta.url), { type: 'module' });
  analiseAtual = { worker, registro };
  const terminar = () => {
    worker.terminate();
    analiseAtual = null;
    analisarProxima();
    if (TELAS_DO_TREINO.includes(estado.tela)) render();
  };
  worker.onmessage = ({ data }) => {
    if (data.tipo === 'progresso') registro.progresso = (data.decisao + data.fracao) / registro.escolhas.length;
    if (data.tipo === 'resultado') {
      const escolha = registro.escolhas[data.decisao];
      escolha.analise = data.resultado;
      escolha.explicacao = explicarDecisao(escolha.decisao, data.resultado);
    }
    if (data.tipo === 'fim') {
      registro.pronta = true;
      registro.progresso = 1;
      terminar();
      return;
    }
    if (TELAS_DO_TREINO.includes(estado.tela)) render();
  };
  worker.onerror = () => {
    registro.erro = true;
    registro.pronta = true;
    terminar();
  };
  worker.postMessage({ decisoes: registro.escolhas.map(e => e.decisao), simulacoes: SIMULACOES_DO_TREINO });
}

// Saiu da partida (início, recomeçar): as análises que estavam rodando ou na fila param.
function pararAnalises() {
  filaDeAnalise.length = 0;
  analiseAtual?.worker.terminate();
  analiseAtual = null;
}

// ---------- Botão "voltar" do celular ----------
// Durante o jogo, o "voltar" do Android não fecha o jogo: abre o menu (na mesa)
// ou volta uma tela (no treinador). Só no início ele sai de verdade.

const temHistorico = typeof history !== 'undefined' && typeof history.pushState === 'function';

function prenderVoltar() {
  if (temHistorico && !history.state?.pontinho) history.pushState({ pontinho: true }, '');
}

window.addEventListener('popstate', () => {
  if (estado.tela === 'inicio') return;
  if (estado.tela === 'mesa') {
    if (!estado.menuAberto) acoes.menu();
  } else if (estado.tela === 'detalhe') {
    acoes.voltarAnalise();
  } else if (estado.tela === 'analise') {
    acoes.voltarTreino();
  } else if (estado.tela === 'relatorio') {
    estado.tela = 'fimJogo';
    render();
  } else if (estado.tela === 'novaPartida') {
    acoes.inicio();
    return;
  }
  prenderVoltar();
});

// ---------- Instalar como app (PWA) ----------
// O Chrome do Android avisa quando dá para instalar; guardamos o aviso para o botão do início.

let pedidoDeInstalar = null;
window.addEventListener('beforeinstallprompt', evento => {
  evento.preventDefault();
  pedidoDeInstalar = evento;
  if (estado.tela === 'inicio') render();
});

// ---------- Toques ----------

const acoes = {
  novaPartida() {
    pararAnalises();
    prenderVoltar();
    Object.assign(estado, { tela: 'novaPartida', partida: null, menuAberto: false });
    render();
  },
  escolherRobos({ n }) {
    estado.qtdRobos = Number(n);
    render();
  },
  async instalar() {
    if (!pedidoDeInstalar) return;
    pedidoDeInstalar.prompt();
    await pedidoDeInstalar.userChoice;
    pedidoDeInstalar = null;
    render();
  },
  alternarSom() {
    mudarPreferencia('som', !preferencias.som);
    if (preferencias.som) tocar('baixar');
    render();
  },
  alternarVibrar() {
    mudarPreferencia('vibrar', !preferencias.vibrar);
    if (preferencias.vibrar) tocar('descartar');
    render();
  },
  alternarTreino() {
    estado.treinador = !estado.treinador;
    render();
  },
  verAnalise({ rodada }) {
    estado.voltarDoTreino = estado.tela === 'relatorio' ? 'relatorio' : 'fimRodada';
    Object.assign(estado, { rodadaVista: Number(rodada), filtroTreino: 'todas', tela: 'analise' });
    irParaOTopo();
  },
  verEscolha({ i }) {
    Object.assign(estado, { escolhaVista: Number(i), tela: 'detalhe' });
    irParaOTopo();
  },
  filtrarTreino({ f }) {
    estado.filtroTreino = f;
    render();
  },
  voltarTreino() {
    estado.tela = estado.voltarDoTreino;
    irParaOTopo();
  },
  voltarAnalise() {
    estado.tela = 'analise';
    irParaOTopo();
  },
  verRelatorio() {
    estado.tela = 'relatorio';
    irParaOTopo();
  },
  escolherNivel({ nivel }) {
    estado.nivel = nivel;
    render();
  },
  comecar() {
    pararAnalises();
    prenderVoltar();
    estado.partida = novaPartida(['Você', ...NOMES_ROBOS.slice(0, estado.qtdRobos)]);
    Object.assign(estado, {
      tela: 'mesa', selecionadas: [], ordemDaMao: [], menuAberto: false,
      vezesQueBateu: 0, saiuNaRodada: {}, lixoVisto: null, treino: [], vezNaRodada: 0, baixarAnotado: false,
    });
    depoisDaAcao(animarDistribuicao);
  },
  inicio() {
    pararAnalises();
    Object.assign(estado, { tela: 'inicio', partida: null, menuAberto: false });
    render();
  },
  menu() { estado.menuAberto = true; render(); },
  fecharMenu() { estado.menuAberto = false; render(); vezDoRobo(); },
  monte() {
    novaVezMinha();
    anotarEscolha('compra', { tipo: 'comprarDoMonte' });
    const de = retangulo(DO_MONTE);
    let comprada;
    tentar(() => { comprada = comprarDoMonte(estado.partida, VOCE); },
      () => voar({ de, para: naMao(comprada.id), html: VERSO, esconder: true, virar: true }), 'comprar');
  },
  lixo() {
    const p = estado.partida;
    const de = retangulo(NO_LIXO);
    const deCima = p.lixo.at(-1);
    const voo = () => voar({ de, para: naMao(deCima.id), html: carta(deCima, { tamanho: 'grande' }), esconder: true });
    // Fora da sua vez: você está dizendo que está pifado e vai bater com essa carta.
    if (p.vez !== VOCE) {
      estado.selecionadas = [];
      tentar(() => ameacarBater(p, VOCE), voo, 'comprar');
      return;
    }
    novaVezMinha();
    anotarEscolha('compra', { tipo: 'comprarDoLixo' });
    tentar(() => comprarDoLixo(p, VOCE), voo, 'comprar');
  },
  desistir() {
    const tipo = estado.partida.tentativa?.tipo;
    estado.lixoVisto = null; // a carta pode voltar ao lixo: os robôs olham de novo
    tentar(() => desistirDeBater(estado.partida, VOCE));
    if (estado.partida.fase === 'batendo') return;
    mostrarAviso(tipo === 'pifado'
      ? 'Você não conseguiu bater e se queimou. A carta voltou para o lixo.'
      : 'Jogada desfeita. Continue a sua vez.');
  },
  devolver() {
    const p = estado.partida;
    const c = p.jogadores[VOCE].mao.find(x => x.id === p.cartaDoLixo);
    const de = retangulo(naMao(p.cartaDoLixo));
    tentar(() => devolverAoLixo(p, VOCE), () => voar({ de, para: NO_LIXO, html: carta(c), esconder: true }), 'descartar');
  },
  carta({ id }) {
    const p = estado.partida;
    if (p.vez !== VOCE || (p.fase !== 'jogar' && p.fase !== 'batendo')) {
      if (p.vez === VOCE) mostrarAviso('Primeiro compre uma carta (do monte ou do lixo).');
      return;
    }
    const s = estado.selecionadas;
    estado.selecionadas = s.includes(id) ? s.filter(x => x !== id) : [...s, id];
    render();
  },
  baixar() {
    if (!estado.baixarAnotado) {
      estado.baixarAnotado = true;
      anotarEscolha('baixar', { tipo: 'baixarJogo', ids: [...estado.selecionadas] });
    }
    tentar(() => baixarJogo(estado.partida, VOCE, estado.selecionadas), null, 'baixar');
  },
  descartar() { descartarCarta(estado.selecionadas[0]); },
  jogo({ jogo }) {
    const p = estado.partida;
    const sel = estado.selecionadas;
    if (sel.length === 0) return;
    const alvo = p.mesa.find(j => j.id === Number(jogo));
    const carta = p.jogadores[VOCE].mao.find(c => c.id === sel[0]);
    // A carta verdadeira de um curinga da mesa: troca (e a jogada vira batida).
    if (sel.length === 1 && alvo && carta && !analisarEncaixe(alvo, [carta], { curinga: p.curinga }) && lugarDoCuringa(alvo, carta) >= 0) {
      tentar(() => trocarCuringa(p, VOCE, alvo.id, carta.id), null, 'baixar');
      return;
    }
    tentar(() => encaixar(p, VOCE, Number(jogo), sel), null, 'baixar');
  },
  organizar() {
    estado.ordem = estado.ordem === 'naipe' ? 'numero' : 'naipe';
    estado.ordemDaMao = ordenarPor(estado.partida.jogadores[VOCE].mao, estado.ordem).map(c => c.id);
    render();
  },
  voltar() { decidirVolta(estado.partida, VOCE, true); depoisDaAcao(); },
  naoVoltar() { decidirVolta(estado.partida, VOCE, false); depoisDaAcao(); },
  proxima() {
    const p = estado.partida;
    if (p.fase === 'fimDoJogo' || p.jogadores[VOCE].situacao === 'fora') {
      estado.tela = 'fimJogo';
      render();
      return;
    }
    proximaRodada(p);
    estado.tela = 'mesa';
    estado.ordemDaMao = [];
    estado.vezNaRodada = 0;
    depoisDaAcao(animarDistribuicao);
  },
};

let bloquearCliqueAte = 0;

app.addEventListener('click', evento => {
  // Sem toques enquanto as cartas voam, nem logo depois de um arrasto
  // (o navegador manda um "clique" quando você solta a carta).
  if (estado.animando || Date.now() < bloquearCliqueAte) return;
  const alvo = evento.target.closest('[data-acao]');
  if (alvo && !alvo.disabled) acoes[alvo.dataset.acao]?.(alvo.dataset);
});

// ---------- Arrastar cartas da mão ----------
// Para os lados: muda a ordem. Até o lixo: descarta.
// Pointer Events funcionam igual com o dedo e com o mouse.

let arrasto = null;
const DISTANCIA_PARA_ARRASTAR = 8; // pixels: menos que isso ainda é um toque
const FOLGA_DO_LIXO = 12;          // pixels a mais em volta do lixo para "acertar" o alvo

app.addEventListener('pointerdown', evento => {
  destravarSom(); // o navegador só deixa tocar som depois de um toque
  if (estado.animando) return;
  const el = evento.target.closest('.mao .carta');
  if (!el) return;
  const cartas = [...el.parentElement.children];
  const caixas = cartas.map(c => c.getBoundingClientRect());
  arrasto = {
    el,
    cartas,
    centros: caixas.map(c => c.left + c.width / 2),
    passo: cartas.length > 1 ? caixas[1].left - caixas[0].left : 0,
    origem: cartas.indexOf(el),
    destino: cartas.indexOf(el),
    inicioX: evento.clientX,
    inicioY: evento.clientY,
    movendo: false,
    sobreLixo: false,
  };
});

window.addEventListener('pointermove', evento => {
  if (!arrasto) return;
  const dx = evento.clientX - arrasto.inicioX;
  const dy = evento.clientY - arrasto.inicioY;
  if (!arrasto.movendo) {
    if (Math.hypot(dx, dy) < DISTANCIA_PARA_ARRASTAR) return;
    arrasto.movendo = true;
    arrasto.el.classList.add('arrastando');
  }
  const { el, cartas, centros, passo, origem } = arrasto;
  el.style.transform = `translate(${dx}px, ${dy - 12}px)`;

  // A carta está em cima do lixo?
  const lixo = document.querySelector('.pilha-lixo');
  const r = lixo?.getBoundingClientRect();
  arrasto.sobreLixo = !!r &&
    evento.clientX > r.left - FOLGA_DO_LIXO && evento.clientX < r.right + FOLGA_DO_LIXO &&
    evento.clientY > r.top - FOLGA_DO_LIXO && evento.clientY < r.bottom + FOLGA_DO_LIXO;
  lixo?.classList.toggle('alvo', arrasto.sobreLixo);
  if (arrasto.sobreLixo) {
    cartas.forEach((c, i) => { if (i !== origem) c.style.transform = ''; });
    return;
  }

  // Onde a carta cairia na mão: quantas outras ficam à esquerda do centro dela.
  const centro = centros[origem] + dx;
  const destino = centros.filter((c, i) => i !== origem && c < centro).length;
  arrasto.destino = destino;

  // As outras cartas abrem espaço.
  cartas.forEach((c, i) => {
    if (i === origem) return;
    let desvio = 0;
    if (origem < destino && i > origem && i <= destino) desvio = -passo;
    if (origem > destino && i >= destino && i < origem) desvio = passo;
    const sobe = c.classList.contains('escolhida') ? ' translateY(-16px)' : '';
    c.style.transform = desvio ? `translateX(${desvio}px)${sobe}` : '';
  });
});

function soltar(cancelou) {
  if (!arrasto) return;
  const { movendo, cartas, origem, destino, sobreLixo, el } = arrasto;
  arrasto = null;
  if (!movendo) return;
  bloquearCliqueAte = Date.now() + 300;

  if (sobreLixo && !cancelou) {
    const p = estado.partida;
    if (p.vez === VOCE && (p.fase === 'jogar' || p.fase === 'batendo')) {
      descartarCarta(el.dataset.id, el.getBoundingClientRect());
      return;
    }
    mostrarAviso(p.vez === VOCE ? 'Primeiro compre uma carta (do monte ou do lixo).' : 'Espere a sua vez para descartar.');
  } else if (!cancelou) {
    const ids = cartas.map(c => c.dataset.id);
    const [movida] = ids.splice(origem, 1);
    ids.splice(destino, 0, movida);
    estado.ordemDaMao = ids;
  }
  render();
}
window.addEventListener('pointerup', () => soltar(false));
window.addEventListener('pointercancel', () => soltar(true));

render();
