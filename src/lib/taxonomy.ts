import type { OecdAreaDefinition, OecdAreaId } from '../types/publication';

export const OECD_AREAS: OecdAreaDefinition[] = [
  {
    id: 'natural-sciences',
    code: '1',
    label: 'Ciencias Naturales y Exactas',
    unescoLabel: 'UNESCO 11-25 · Ciencias Exactas y Biológicas',
    accent: '#46545B',
    description: 'Matemáticas, física, química, biología, ecología y ciencias de la tierra.'
  },
  {
    id: 'engineering-tech',
    code: '2',
    label: 'Ingeniería y Tecnología',
    unescoLabel: 'UNESCO 33 · Ciencias Tecnológicas',
    accent: '#3B6E8C',
    description: 'Computación, arquitectura, ingeniería civil, materiales y energía.'
  },
  {
    id: 'medical-health',
    code: '3',
    label: 'Ciencias Médicas y de la Salud',
    unescoLabel: 'UNESCO 32 · Ciencias Médicas',
    accent: '#9E2A2B',
    description: 'Salud colectiva, epidemiología, medicina clínica, psicología y enfermería.'
  },
  {
    id: 'agricultural-sciences',
    code: '4',
    label: 'Ciencias Agrícolas y Veterinaria',
    unescoLabel: 'UNESCO 31 · Ciencias Agrarias',
    accent: '#4D6B53',
    description: 'Agronomía, silvicultura, zootecnia, biotecnología agroalimentaria y suelos.'
  },
  {
    id: 'social-sciences',
    code: '5',
    label: 'Ciencias Sociales y Educación',
    unescoLabel: 'UNESCO 52-59 · Ciencias Sociales, Derecho y Pedagogía',
    accent: '#B8863B',
    description: 'Sociología, educación, economía, derecho, ciencia política y comunicación.'
  },
  {
    id: 'humanities',
    code: '6',
    label: 'Humanidades y Artes',
    unescoLabel: 'UNESCO 55, 61-72 · Historia, Filosofía y Letras',
    accent: '#7D4E57',
    description: 'Historia, literatura, lingüística, filosofía, antropología cultural y artes.'
  }
];

export const OECD_AREA_MAP: Record<OecdAreaId, OecdAreaDefinition> = OECD_AREAS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<OecdAreaId, OecdAreaDefinition>
);

const AREA_KEYWORDS: Record<OecdAreaId, RegExp> = {
  'medical-health':
    /\b(saúde|salud|health|medicin|clínic|clinica|epidemiolog|enferm|psiquiatr|psicolog|depress|sus\b|fiocruz|hospital|covid|pandemia|vacin|vacun|sanitár|sanitar|doença|enfermedad|nutri|dieta|envelhecimento|bioétic|farmac|odontolog|toxicolog)\b/i,
  'agricultural-sciences':
    /\b(agríc|agric|agronom|agroecolog|soja|solo|suelo|florest|bosque|zootecni|veterinár|veterinar|pecuár|pecuar|cultivo|semente|semilla|cerrado|botânic|botanic|jbrj|pesca|alimento|rural|safra)\b/i,
  'engineering-tech':
    /\b(engenhari|ingenier|tecnolog|computa|software|algoritm|robótic|robotic|arquitetur|arquitectur|urbano|elétric|electr|energ|material|tv digital|telecom|automação|automatiz|construç|sistema|dados|datos|informátic)\b/i,
  'natural-sciences':
    /\b(matemátic|matematic|físic|fisic|químic|quimic|biolog|ecolog|zoolog|biodivers|oceano|marinh|marino|genétic|genetic|estatístic|estadistic|sbmac|clima|ambient|geolog|geograf|astron|botân|microbi)\b/i,
  humanities:
    /\b(históri|histori|filosof|literatur|lingüíst|linguist|letras|arte|músic|music|memóri|memori|patrimôn|patrimon|ética|etica|religi|estétic|estetic|poes|romance|narrativ|cultura|arquivo|archivo|teatro|cinema)\b/i,
  'social-sciences':
    /\b(educa|ensino|enseñanza|pedagog|social|sociolog|polític|politic|econom|direito|derecho|administra|gestão|gestion|estado|públic|public|comunica|indígen|indigen|demograf|trabalho|trabajo|gênero|genero|antirracis|justiça|justicia|cidadania|ciudadan|fgv|unesp|unicamp|rosario)\b/i
};

const OPENALEX_DOMAIN_TO_OECD: Record<string, OecdAreaId> = {
  'https://openalex.org/domains/1': 'natural-sciences', // Life Sciences -> check medical/agri too
  'https://openalex.org/domains/2': 'social-sciences',
  'https://openalex.org/domains/3': 'natural-sciences',
  'https://openalex.org/domains/4': 'medical-health'
};

export function classifyOecdArea(input: {
  title?: string;
  abstract?: string;
  keywords?: string[];
  publisher?: string;
  setSpec?: string;
  openAlexDomainId?: string;
  openAlexFieldName?: string;
}): { area: OecdAreaId; label: string; subarea?: string } {
  const combined = [
    input.title || '',
    input.abstract || '',
    (input.keywords || []).join(' '),
    input.publisher || '',
    input.setSpec || '',
    input.openAlexFieldName || ''
  ].join(' ');

  if (input.openAlexFieldName) {
    const f = input.openAlexFieldName.toLowerCase();
    if (f.includes('medicine') || f.includes('nursing') || f.includes('health') || f.includes('psychology') || f.includes('pharmacology')) {
      return { area: 'medical-health', label: OECD_AREA_MAP['medical-health'].label, subarea: input.openAlexFieldName };
    }
    if (f.includes('agricultural') || f.includes('veterinary')) {
      return { area: 'agricultural-sciences', label: OECD_AREA_MAP['agricultural-sciences'].label, subarea: input.openAlexFieldName };
    }
    if (f.includes('engineering') || f.includes('computer') || f.includes('energy') || f.includes('materials')) {
      return { area: 'engineering-tech', label: OECD_AREA_MAP['engineering-tech'].label, subarea: input.openAlexFieldName };
    }
    if (f.includes('arts') || f.includes('humanities')) {
      return { area: 'humanities', label: OECD_AREA_MAP.humanities.label, subarea: input.openAlexFieldName };
    }
    if (f.includes('social') || f.includes('economics') || f.includes('business') || f.includes('decision')) {
      return { area: 'social-sciences', label: OECD_AREA_MAP['social-sciences'].label, subarea: input.openAlexFieldName };
    }
    if (f.includes('biochemistry') || f.includes('environmental') || f.includes('mathematics') || f.includes('physics') || f.includes('chemistry') || f.includes('earth')) {
      return { area: 'natural-sciences', label: OECD_AREA_MAP['natural-sciences'].label, subarea: input.openAlexFieldName };
    }
  }

  // Publisher & setSpec strong priors for SciELO Books
  const set = (input.setSpec || '').toLowerCase();
  const pub = (input.publisher || '').toLowerCase();
  if (set.includes('fiocruz') || pub.includes('fiocruz') || set.includes('saude')) {
    if (!AREA_KEYWORDS['social-sciences'].test(input.title || '')) {
      return { area: 'medical-health', label: OECD_AREA_MAP['medical-health'].label, subarea: 'Salud Colectiva' };
    }
  }
  if (set.includes('sbmac')) {
    return { area: 'natural-sciences', label: OECD_AREA_MAP['natural-sciences'].label, subarea: 'Matemática Aplicada' };
  }
  if (set.includes('zoologia') || set.includes('jbrj') || set.includes('rebentos')) {
    return { area: 'natural-sciences', label: OECD_AREA_MAP['natural-sciences'].label, subarea: 'Biodiversidad y Ecología' };
  }
  if (set.includes('fgv-direito')) {
    return { area: 'social-sciences', label: OECD_AREA_MAP['social-sciences'].label, subarea: 'Derecho y Gobernanza' };
  }

  // Score keyword matches
  const scores: Record<OecdAreaId, number> = {
    'natural-sciences': 0,
    'engineering-tech': 0,
    'medical-health': 0,
    'agricultural-sciences': 0,
    'social-sciences': 0,
    humanities: 0
  };

  for (const area of Object.keys(AREA_KEYWORDS) as OecdAreaId[]) {
    const regex = new RegExp(AREA_KEYWORDS[area].source, 'gi');
    const titleMatches = (input.title || '').match(regex)?.length ?? 0;
    const bodyMatches = combined.match(regex)?.length ?? 0;
    scores[area] = titleMatches * 3 + bodyMatches;
  }

  let bestArea: OecdAreaId = input.openAlexDomainId ? (OPENALEX_DOMAIN_TO_OECD[input.openAlexDomainId] ?? 'social-sciences') : 'social-sciences';
  let bestScore = 0;
  for (const area of Object.keys(scores) as OecdAreaId[]) {
    if (scores[area] > bestScore) {
      bestScore = scores[area];
      bestArea = area;
    }
  }

  return {
    area: bestArea,
    label: OECD_AREA_MAP[bestArea].label,
    subarea: input.openAlexFieldName
  };
}
