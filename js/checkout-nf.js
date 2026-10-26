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
function dadosNF() {
  if (!window.BrasilCampos) return null;
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
