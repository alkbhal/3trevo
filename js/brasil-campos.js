/**
 * brasil-campos.js — campos fiscais do checkout (nota fiscal)
 *
 * - CPF: validado só aqui no navegador (dígitos verificadores). O CPF não é
 *   enviado à BrasilAPI: não há o que consultar e evita compartilhar dado pessoal.
 * - CNPJ: dígitos verificadores + consulta pública na BrasilAPI (razão social e
 *   situação cadastral; só CNPJ ATIVO é aceito).
 * - CEP: consulta na BrasilAPI e preenche rua, bairro, cidade e UF.
 *
 * O Worker repete a validação de CPF/CNPJ/CEP/UF (nunca confiar só no navegador).
 */
(function () {
  'use strict';

  var API = 'https://brasilapi.com.br/api';

  function digitos(v) { return String(v || '').replace(/\D/g, ''); }
  // CNPJ alfanumérico (Receita, a partir de jul/2026): 12 posições [0-9A-Z] + 2 DVs numéricos.
  function documento(v) { return String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }

  function cpfValido(v) {
    var d = digitos(v);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (var t = 9; t < 11; t++) {
      var soma = 0;
      for (var i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
    }
    return true;
  }

  function cnpjValido(v) {
    var d = documento(v);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
    var pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (var t = 12; t < 14; t++) {
      var soma = 0;
      for (var i = 0; i < t; i++) soma += (d.charCodeAt(i) - 48) * pesos[i + 13 - t];
      var resto = soma % 11;
      if ((resto < 2 ? 0 : 11 - resto) !== Number(d[t])) return false;
    }
    return true;
  }

  // Máscara automática: até 11 dígitos formata como CPF, acima como CNPJ.
  function mascaraDocumento(v) {
    var d = documento(v).slice(0, 14);
    if (d.length <= 11 && /^\d*$/.test(d)) {
      return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    var X = '[0-9A-Z]';
    return d.replace(new RegExp('^(' + X + '{2})(' + X + ')'), '$1.$2')
      .replace(new RegExp('^(' + X + '{2})\\.(' + X + '{3})(' + X + ')'), '$1.$2.$3')
      .replace(new RegExp('\\.(' + X + '{3})(' + X + ')'), '.$1/$2')
      .replace(new RegExp('/(' + X + '{4})(' + X + '{1,2})$'), '/$1-$2');
  }

  function mascaraCep(v) {
    return digitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
  }

  async function getJson(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    try {
      var r = await fetch(url, ctrl ? { signal: ctrl.signal } : {});
      if (r.status === 404 || r.status === 400) return { ok: false, motivo: 'nao_encontrado' };
      if (!r.ok) return { ok: false, motivo: 'indisponivel' };
      return { ok: true, dados: await r.json() };
    } catch (e) {
      return { ok: false, motivo: 'indisponivel' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // { ok, endereco:{cep,logradouro,bairro,cidade,uf} } | { ok:false, motivo }
  async function buscarCep(v) {
    var cep = digitos(v);
    if (cep.length !== 8) return { ok: false, motivo: 'formato' };
    var r = await getJson(API + '/cep/v2/' + cep);
    if (!r.ok) return r;
    var d = r.dados || {};
    return { ok: true, endereco: {
      cep: cep, logradouro: d.street || '', bairro: d.neighborhood || '',
      cidade: d.city || '', uf: d.state || '',
      ibge: (typeof d.ibge === 'string' || typeof d.ibge === 'number') ? String(d.ibge) : '',
    } };
  }

  // { ok, razao_social, ativo, situacao } | { ok:false, motivo }
  async function buscarCnpj(v) {
    var cnpj = documento(v);
    if (!cnpjValido(cnpj)) return { ok: false, motivo: 'formato' };
    var r = await getJson(API + '/cnpj/v1/' + cnpj);
    if (!r.ok) return r;
    var d = r.dados || {};
    var situacao = String(d.descricao_situacao_cadastral || '').toUpperCase();
    return {
      ok: true, razao_social: d.razao_social || '', situacao: situacao,
      ativo: situacao === 'ATIVA',
      endereco: d.cep ? {
        cep: digitos(d.cep), logradouro: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '),
        numero: d.numero || '', complemento: d.complemento || '', bairro: d.bairro || '',
        cidade: d.municipio || '', uf: d.uf || '',
        ibge: d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : '',
      } : null,
    };
  }

  window.BrasilCampos = {
    digitos: digitos, documento: documento, cpfValido: cpfValido, cnpjValido: cnpjValido,
    mascaraDocumento: mascaraDocumento, mascaraCep: mascaraCep,
    buscarCep: buscarCep, buscarCnpj: buscarCnpj,
  };
})();
