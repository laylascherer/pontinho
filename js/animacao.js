// Animações das cartas: uma cópia da carta "voa" de um lugar da tela para outro.
// Usa a Web Animations API (element.animate), que já vem no navegador.

const reduzirMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function retangulo(alvo) {
  const el = typeof alvo === 'string' ? document.querySelector(alvo) : alvo;
  return el ? el.getBoundingClientRect() : null;
}

// de: retângulo de onde a carta sai; para: elemento (ou seletor) aonde ela chega.
// html: como a carta voadora aparece (frente ou verso).
// esconder: o destino fica invisível até a carta chegar (cartas da mão, lixo).
// encolher: a carta diminui e some ao chegar (quando vai para o quadro de um robô).
// virar: ao chegar, o destino dá uma "virada" (carta que estava de costas).
// htmlFinal: a carta vira no meio do caminho (ex.: de costas para de frente).
export async function voar({ de, para, html, htmlFinal, duracao = 380, atraso = 0, esconder = false, encolher = false, virar = false }) {
  const destino = typeof para === 'string' ? document.querySelector(para) : para;
  if (!de || !destino || reduzirMovimento()) return;
  if (esconder) destino.style.visibility = 'hidden';

  const voadora = document.createElement('div');
  voadora.className = 'voadora';
  voadora.innerHTML = html;
  document.body.append(voadora);
  const base = voadora.firstElementChild.getBoundingClientRect();

  const alvo = destino.getBoundingClientRect();
  const escalaInicio = de.width / base.width;
  const escalaFim = encolher ? 0.45 : alvo.width / base.width;
  const fimX = alvo.left + (alvo.width - base.width * escalaFim) / 2;
  const fimY = alvo.top + (alvo.height - base.height * escalaFim) / 2;

  const animacao = voadora.animate([
    { transform: `translate(${de.left}px, ${de.top}px) scale(${escalaInicio})`, opacity: 1 },
    { transform: `translate(${fimX}px, ${fimY}px) scale(${escalaFim})`, opacity: encolher ? 0 : 1 },
  ], { duration: duracao, delay: atraso, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'both' });

  let troca;
  if (htmlFinal) troca = setTimeout(() => { voadora.innerHTML = htmlFinal; }, atraso + duracao / 2);

  try {
    await animacao.finished;
  } finally {
    clearTimeout(troca);
    voadora.remove();
    if (esconder) destino.style.visibility = '';
  }
  if (virar && destino.isConnected) {
    destino.animate([{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0deg)' }], { duration: 160, easing: 'ease-out' });
  }
}
