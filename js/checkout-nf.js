/**
 * checkout-nf.js — formulário "Dados para a nota fiscal" do checkout.html
 * Depende de js/brasil-campos.js. Expõe dadosNF() (null enquanto incompleto),
 * usado por validarFormulario() e iniciarPagamento() no checkout.
 */
// ── NOTA FISCAL (CPF/CNPJ + endereço) ────────────────────
// CPF: só os dígitos verificadores, no navegador (não sai para terceiros).
// CNPJ e CEP: consulta pública na BrasilAPI. O Worker valida tudo de novo.
var cnpjBloqueado = false; // CNPJ que a Receita informa como não ativo
var docConsultado = '';
function campo(id) { return document.getElementById(id); }
function aviso(id, msg, tipo) {
  var el = campo(id);
  el.textContent = msg || '';
  el.className = 'campo-aviso' + (tipo ? ' ' + tipo : '');
}
function tipoDocumento() {
  var d = BrasilCampos.documento(campo('docInput').value);
  if (d.length === 11 && BrasilCampos.cpfValido(d)) return 'CPF';
  if (d.length === 14 && BrasilCampos.cnpjValido(d)) return 'CNPJ';
  return null;
}
// ── Comprador no exterior: NF de exportação (sem CPF/CEP; país + endereço) ──
var PAISES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');
function montarPaises() {
  var sel = campo('paisSelect');
  var nomes = null;
  try { nomes = new Intl.DisplayNames(['pt-BR'], { type: 'region' }); } catch (e) {}
  var lista = PAISES.map(function (c) { return [c, nomes ? nomes.of(c) : c]; })
    .sort(function (a, b) { return a[1].localeCompare(b[1], 'pt-BR'); });
  sel.innerHTML = '<option value="">Selecione / Select…</option>';
  lista.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p[0]; o.textContent = p[1];
    sel.appendChild(o);
  });
}
function noExterior() { return campo('exteriorCheck').checked; }
function alternarExterior() {
  var fora = noExterior();
  campo('nfExterior').hidden = !fora;
  campo('nfBrasil').hidden = fora;
  validarFormulario();
}
function dadosExterior() {
  var nf = {
    exterior: true,
    pais: campo('paisSelect').value,
    logradouro: campo('exRuaInput').value.trim(),
    cidade: campo('exCidadeInput').value.trim(),
    cep: campo('exPostalInput').value.trim(),
    documento: campo('exDocInput').value.trim(),
  };
  if (!/^[A-Z]{2}$/.test(nf.pais) || !nf.logradouro || !nf.cidade) return null;
  return nf;
}
document.addEventListener('DOMContentLoaded', function iniciarExterior() {
  montarPaises();
  // quem chega dos sites em inglês ou espanhol já começa com "moro fora do Brasil"
  if (/\/(en|es)\//.test(document.referrer)) { campo('exteriorCheck').checked = true; alternarExterior(); }
});

function dadosNF() {
  if (!window.BrasilCampos) return null;
  if (noExterior()) return dadosExterior();
  var tipo = tipoDocumento();
  if (!tipo || (tipo === 'CNPJ' && cnpjBloqueado)) return null;
  var nf = {
    documento: BrasilCampos.documento(campo('docInput').value),
    cep: BrasilCampos.digitos(campo('cepInput').value),
    logradouro: campo('ruaInput').value.trim(),
    numero: campo('numeroInput').value.trim(),
    complemento: campo('complInput').value.trim(),
    bairro: campo('bairroInput').value.trim(),
    cidade: campo('cidadeInput').value.trim(),
    uf: campo('ufInput').value.trim().toUpperCase(),
    ibge: campo('cidadeInput').dataset.ibge || '',
  };
  if (nf.cep.length !== 8 || !/^[A-Z]{2}$/.test(nf.uf) || !nf.logradouro || !nf.numero || !nf.bairro || !nf.cidade) return null;
  return nf;
}
function aoDigitarDocumento() {
  var el = campo('docInput');
  el.value = BrasilCampos.mascaraDocumento(el.value);
  var d = BrasilCampos.documento(el.value);
  cnpjBloqueado = false;
  el.classList.remove('invalido');
  if (d.length === 11 && /^\d+$/.test(d)) {
    BrasilCampos.cpfValido(d) ? aviso('docAviso', 'CPF válido.', 'ok') : (aviso('docAviso', 'CPF inválido. Confira os números.', 'erro'), el.classList.add('invalido'));
  } else if (d.length === 14) {
    if (!BrasilCampos.cnpjValido(d)) { aviso('docAviso', 'CNPJ inválido. Confira os caracteres.', 'erro'); el.classList.add('invalido'); }
    else consultarCnpj(d);
  } else {
    aviso('docAviso', '');
  }
  validarFormulario();
}
function aoSairDocumento() {
  var d = BrasilCampos.documento(campo('docInput').value);
  if (d && !tipoDocumento()) {
    aviso('docAviso', 'Informe um CPF (11 números) ou CNPJ (14 caracteres) válido.', 'erro');
    campo('docInput').classList.add('invalido');
  }
}
async function consultarCnpj(d) {
  if (docConsultado === d) return;
  docConsultado = d;
  aviso('docAviso', 'CNPJ válido. Consultando a Receita…', 'ok');
  var r = await BrasilCampos.buscarCnpj(d);
  if (BrasilCampos.documento(campo('docInput').value) !== d) return; // usuário já mudou o campo
  if (!r.ok) {
    // CNPJ novo ou API fora do ar: os dígitos conferem, segue sem bloquear a compra.
    aviso('docAviso', r.motivo === 'nao_encontrado'
      ? 'CNPJ válido, mas não encontrado na base pública. Confira antes de pagar.'
      : 'CNPJ válido. Não foi possível consultar a Receita agora.', 'ok');
    return validarFormulario();
  }
  if (!r.ativo) {
    cnpjBloqueado = true;
    campo('docInput').classList.add('invalido');
    aviso('docAviso', 'Este CNPJ está com situação "' + (r.situacao || 'irregular') + '" na Receita. Use um CNPJ ativo ou o seu CPF.', 'erro');
    return validarFormulario();
  }
  aviso('docAviso', 'CNPJ ativo: ' + r.razao_social, 'ok');
  if (r.razao_social && !campo('nomeInput').value.trim()) campo('nomeInput').value = r.razao_social;
  if (r.endereco && !campo('cepInput').value.trim()) preencherEndereco(r.endereco, true);
  validarFormulario();
}
function preencherEndereco(e, comNumero) {
  campo('cepInput').value = BrasilCampos.mascaraCep(e.cep);
  if (e.logradouro) campo('ruaInput').value = e.logradouro;
  if (e.bairro) campo('bairroInput').value = e.bairro;
  if (e.cidade) campo('cidadeInput').value = e.cidade;
  if (e.uf) campo('ufInput').value = e.uf;
  campo('cidadeInput').dataset.ibge = e.ibge || '';
  if (comNumero && e.numero) campo('numeroInput').value = e.numero;
  if (comNumero && e.complemento) campo('complInput').value = e.complemento;
}
var cepConsultado = '';
async function aoDigitarCep() {
  var el = campo('cepInput');
  el.value = BrasilCampos.mascaraCep(el.value);
  var cep = BrasilCampos.digitos(el.value);
  el.classList.remove('invalido');
  campo('cidadeInput').dataset.ibge = '';
  validarFormulario();
  if (cep.length !== 8) { aviso('cepAviso', ''); cepConsultado = ''; return; }
  if (cep === cepConsultado) return;
  cepConsultado = cep;
  aviso('cepAviso', 'Buscando endereço…');
  var r = await BrasilCampos.buscarCep(cep);
  if (BrasilCampos.digitos(campo('cepInput').value) !== cep) return;
  if (!r.ok) {
    if (r.motivo === 'nao_encontrado') { el.classList.add('invalido'); aviso('cepAviso', 'CEP não encontrado. Confira ou preencha o endereço à mão.', 'erro'); }
    else aviso('cepAviso', 'Não foi possível buscar o CEP agora. Preencha o endereço à mão.', 'erro');
    return validarFormulario();
  }
  preencherEndereco(r.endereco, false);
  aviso('cepAviso', 'Endereço preenchido. Confira e informe o número.', 'ok');
  campo(r.endereco.logradouro ? 'numeroInput' : 'ruaInput').focus();
  validarFormulario();
}
