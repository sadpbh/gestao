// ============================================================
// Cobertura de Escalas · SAD-BH
// ferias-logic.js — cálculo de saldo e motor de validação de
// conflitos de férias. Funções puras, sem chamadas de rede.
// ============================================================

var MOTIVOS_BLOQUEIO_SEMPRE = ['Férias Regulamentares', 'Pausa Contratual'];
// Férias Prêmio só bloqueia se o período for < 60 dias corridos.

function diasCorridos(inicio, fim) {
  var i = new Date(inicio + 'T00:00:00');
  var f = new Date(fim + 'T00:00:00');
  return Math.round((f - i) / 86400000) + 1;
}

function diasUteis(inicio, fim) {
  var i = new Date(inicio + 'T00:00:00');
  var f = new Date(fim + 'T00:00:00');
  var count = 0;
  var atual = new Date(i);
  while (atual <= f) {
    var dow = atual.getDay();
    if (dow !== 0 && dow !== 6) count++;
    atual.setDate(atual.getDate() + 1);
  }
  return count;
}

function periodosSeSobrepoe(inicioA, fimA, inicioB, fimB) {
  return inicioA <= fimB && inicioB <= fimA;
}

// ------------------------------------------------------------
// Ciclo aquisitivo atual (12 em 12 meses a partir da data de
// início do contrato), calculado em relação a hoje.
// ------------------------------------------------------------
function cicloAtual(dataInicioContrato, hoje) {
  hoje = hoje || new Date();
  var inicio = new Date(dataInicioContrato + 'T00:00:00');
  var cicloIni = new Date(inicio);
  while (true) {
    var proximo = new Date(cicloIni);
    proximo.setFullYear(proximo.getFullYear() + 1);
    if (proximo > hoje) break;
    cicloIni = proximo;
  }
  var cicloFim = new Date(cicloIni);
  cicloFim.setFullYear(cicloFim.getFullYear() + 1);
  cicloFim.setDate(cicloFim.getDate() - 1);
  return { inicio: isoData(cicloIni), fim: isoData(cicloFim) };
}

function isoData(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function anosCompletos(dataInicioContrato, hoje) {
  hoje = hoje || new Date();
  var inicio = new Date(dataInicioContrato + 'T00:00:00');
  var anos = hoje.getFullYear() - inicio.getFullYear();
  var aniversario = new Date(inicio);
  aniversario.setFullYear(inicio.getFullYear() + anos);
  if (aniversario > hoje) anos--;
  return Math.max(0, anos);
}

// ------------------------------------------------------------
// Saldo de férias regulamentares no ciclo aquisitivo atual.
// registrosGozo: array de {data_inicio, data_fim, motivo, status}
// (ausências já lançadas + solicitações aprovadas/pendentes).
// ------------------------------------------------------------
function calcularSaldoRegulamentar(tipoContrato, dataInicioContrato, registrosGozo, hoje) {
  if (!dataInicioContrato) return null;
  var ciclo = cicloAtual(dataInicioContrato, hoje);
  var direito = tipoContrato === 'efetivo' ? 25 : 30;
  var contarFn = tipoContrato === 'efetivo' ? diasUteis : diasCorridos;

  var gozado = 0;
  (registrosGozo || []).forEach(function (r) {
    if (r.motivo !== 'Férias Regulamentares') return;
    if (!periodosSeSobrepoe(r.data_inicio, r.data_fim, ciclo.inicio, ciclo.fim)) return;
    gozado += contarFn(r.data_inicio, r.data_fim);
  });

  return { ciclo: ciclo, direito: direito, gozado: gozado, saldo: direito - gozado, unidade: tipoContrato === 'efetivo' ? 'dias úteis' : 'dias corridos' };
}

// ------------------------------------------------------------
// Saldo de férias prêmio (só efetivo). Acumula 90 dias a cada
// quinquênio completo; saldo = total de direito acumulado -
// total já gozado (histórico completo, sem recorte por ciclo).
// ------------------------------------------------------------
function calcularSaldoPremio(tipoContrato, dataInicioContrato, registrosGozo, hoje) {
  if (tipoContrato !== 'efetivo' || !dataInicioContrato) return null;
  var anos = anosCompletos(dataInicioContrato, hoje);
  var quinquenios = Math.floor(anos / 5);
  var direitoTotal = quinquenios * 90;

  var gozado = 0;
  (registrosGozo || []).forEach(function (r) {
    if (r.motivo !== 'Férias Prêmio') return;
    gozado += diasCorridos(r.data_inicio, r.data_fim);
  });

  return { anosServico: anos, quinquenios: quinquenios, direito: direitoTotal, gozado: gozado, saldo: direitoTotal - gozado };
}

// ------------------------------------------------------------
// Monta o grupo de conflito: lista de pessoa_id que precisam
// ser checadas contra a pessoa solicitante, conforme a regra
// da categoria dela.
//
// contexto = {
//   pessoaId, categoria, equipeId, turno, tipoEquipe (EMAD/EMAP), equipeIrmaId,
//   todasLotacoes: [{ pessoaId, categoria, equipeId, turno }]  (de todas as pessoas ativas)
// }
// ------------------------------------------------------------
function montarGrupoConflito(ctx) {
  var grupo = {}; // pessoaId -> true

  function adicionarDe(equipeId, filtro) {
    ctx.todasLotacoes.forEach(function (l) {
      if (l.equipeId === equipeId && l.pessoaId !== ctx.pessoaId && filtro(l)) {
        grupo[l.pessoaId] = true;
      }
    });
  }

  if (ctx.categoria === 'tecnico_enfermagem') {
    adicionarDe(ctx.equipeId, function (l) { return l.categoria === 'tecnico_enfermagem'; });
  } else if (ctx.categoria === 'medico' || ctx.categoria === 'enfermeiro') {
    adicionarDe(ctx.equipeId, function (l) { return l.categoria === 'medico' || l.categoria === 'enfermeiro'; });
    if (ctx.equipeIrmaId) {
      adicionarDe(ctx.equipeIrmaId, function (l) { return l.categoria === ctx.categoria && l.turno === ctx.turno; });
    }
  } else if (ctx.categoria === 'assistente_social') {
    if (ctx.equipeIrmaId) {
      adicionarDe(ctx.equipeIrmaId, function (l) { return l.categoria === 'assistente_social'; });
    }
  } else {
    // demais categorias EMAP
    adicionarDe(ctx.equipeId, function () { return true; });
    if (ctx.equipeIrmaId) {
      adicionarDe(ctx.equipeIrmaId, function (l) { return l.categoria === ctx.categoria; });
    }
  }

  return Object.keys(grupo);
}

// ------------------------------------------------------------
// Verifica se a solicitação conflita com alguém do grupo.
// registrosGrupo: array de { pessoa_id, data_inicio, data_fim, motivo, status }
// (ausências existentes + solicitações pendentes/aprovadas de
// todo mundo do grupo de conflito).
// ------------------------------------------------------------
function verificarConflito(dataInicio, dataFim, tipoFerias, registrosGrupo) {
  for (var i = 0; i < (registrosGrupo || []).length; i++) {
    var r = registrosGrupo[i];
    var duracao = diasCorridos(r.data_inicio, r.data_fim);
    var motivoBloqueia = MOTIVOS_BLOQUEIO_SEMPRE.indexOf(r.motivo) !== -1 ||
      (r.motivo === 'Férias Prêmio' && duracao < 60);
    if (!motivoBloqueia) continue;
    if (periodosSeSobrepoe(dataInicio, dataFim, r.data_inicio, r.data_fim)) {
      return { conflita: true, comQuem: r.pessoaNome || r.pessoa_id, motivo: r.motivo, periodo: r.data_inicio + ' a ' + r.data_fim };
    }
  }
  return { conflita: false };
}
