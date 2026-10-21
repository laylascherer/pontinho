// Roda a análise do treinador em segundo plano (Web Worker), para a tela não travar.
// Recebe { decisoes, simulacoes } e manda de volta o progresso e o resultado de cada decisão.

import { analisarDecisao } from './treinador.js';

self.onmessage = ({ data }) => {
  const { decisoes, simulacoes } = data;
  decisoes.forEach((decisao, i) => {
    let ultimo = 0;
    const resultado = analisarDecisao(decisao, {
      simulacoes,
      semente: i + 1,
      aoProgredir: fracao => {
        // Avisa a tela a cada 5%, não a cada simulação.
        if (fracao - ultimo >= 0.05 || fracao === 1) {
          ultimo = fracao;
          self.postMessage({ tipo: 'progresso', decisao: i, fracao });
        }
      },
    });
    self.postMessage({ tipo: 'resultado', decisao: i, resultado });
  });
  self.postMessage({ tipo: 'fim' });
};
