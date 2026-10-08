export interface CinemometerTextInput {
  readonly recordedSpeed: number;
  readonly deducedSpeed: number;
  readonly speedLimit: number;
  readonly mode: string;
  readonly marca?: string | null | undefined;
  readonly modelo?: string | null | undefined;
  readonly serie?: string | null | undefined;
  readonly ansr?: string | null | undefined;
  readonly ipq?: string | null | undefined;
  readonly dataipq?: string | null | undefined;
  readonly certtipo?: string | null | undefined;
  readonly cert?: string | null | undefined;
  readonly operadorNumero?: string | null | undefined;
  readonly operadorNome?: string | null | undefined;
  readonly operadorPosto?: string | null | undefined;
}

export function buildCinemometerOperationalText(input: CinemometerTextInput): string {
  if (![input.recordedSpeed, input.deducedSpeed, input.speedLimit].every(Number.isFinite)) {
    return 'Preencha a velocidade registada e o limite permitido para gerar o texto do auto.';
  }

  const device = [
    input.marca?.trim() || '',
    input.modelo?.trim() ? ', modelo ' + input.modelo.trim() : '',
    input.serie?.trim() ? ' n.º ' + input.serie.trim() : ''
  ].join('');

  let text =
    'O veículo circulava, pelo menos, à velocidade de ' + input.deducedSpeed +
    ' km/h correspondente à velocidade registada de ' + input.recordedSpeed +
    ' km/h, deduzido o valor do erro máximo admissível, sendo o limite máximo de velocidade permitido no local de ' +
    input.speedLimit + ' km/h. ';

  text += 'A velocidade foi verificada através do aparelho Cinemómetro - ' + device + '. ';
  if (input.ansr?.trim()) text += 'Aprovado para controlo e fiscalização pela ANSR através de ' + input.ansr.trim() + '. ';
  if (input.ipq?.trim()) text += 'Pelo IPQ através de ' + input.ipq.trim() + '. ';
  if (input.dataipq?.trim()) text += 'Verificado pelo IPQ em ' + input.dataipq.trim();
  if (input.certtipo?.trim()) text += ', com ' + input.certtipo.trim();
  if (input.cert?.trim()) text += ' n.º ' + input.cert.trim();
  if (input.dataipq?.trim() || input.certtipo?.trim() || input.cert?.trim()) text += '. ';

  if (input.operadorNumero?.trim() || input.operadorNome?.trim() || input.operadorPosto?.trim()) {
    text += 'Operador' +
      (input.operadorNumero?.trim() ? ' n.º ' + input.operadorNumero.trim() : '') +
      (input.operadorNome?.trim() ? ' — ' + input.operadorNome.trim() : '') +
      (input.operadorPosto?.trim() ? ' — ' + input.operadorPosto.trim() : '') +
      '.';
  }

  return text;
}