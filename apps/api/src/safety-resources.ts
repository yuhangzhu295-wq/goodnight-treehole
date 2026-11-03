export interface SafetyResourceItem {
  id: string;
  name: string;
  number: string;
  type: 'emergency' | 'hotline' | 'guidance';
  description: string;
  verified: boolean;
  action: 'tel' | 'link' | 'guidance';
  url?: string;
}

export interface RegionalSafetyPayload {
  region: string;
  regionName: string;
  isUnknownRegion: boolean;
  universalGuidance: string[];
  resources: SafetyResourceItem[];
  supportedRegions: Array<{ code: string; name: string }>;
}

export const SUPPORTED_SAFETY_REGIONS = [
  { code: 'CN', name: '中国大陆 (Mainland China)' },
  { code: 'HK', name: '中国香港 (Hong Kong)' },
  { code: 'MO', name: '中国澳门 (Macau)' },
  { code: 'TW', name: '中国台湾 (Taiwan)' },
  { code: 'OTHER', name: '其他国家/海外地区 (Other Regions)' },
];

export const REGIONAL_SAFETY_RESOURCES: Record<string, SafetyResourceItem[]> = {
  CN: [
    {
      id: 'cn-120',
      name: '紧急医疗救护 120',
      number: '120',
      type: 'emergency',
      description: '全国统一院前医疗急救呼叫专线，适用于生命健康即时危险',
      verified: true,
      action: 'tel',
    },
    {
      id: 'cn-12356',
      name: '全国心理援助热线 12356',
      number: '12356',
      type: 'hotline',
      description: '国家卫生健康委统一心理援助热线（24小时在线）',
      verified: true,
      action: 'tel',
    },
    {
      id: 'cn-110',
      name: '紧急治安报警 110',
      number: '110',
      type: 'emergency',
      description: '全国公安统一紧急报警电话',
      verified: true,
      action: 'tel',
    },
  ],
  HK: [
    {
      id: 'hk-999',
      name: '香港紧急求助 999',
      number: '999',
      type: 'emergency',
      description: '香港紧急报警、火警及救护服务',
      verified: true,
      action: 'tel',
    },
    {
      id: 'hk-samaritans',
      name: '香港撒玛利亚防止自杀会热线',
      number: '23892222',
      type: 'hotline',
      description: '24小时情绪支援及预防自杀热线',
      verified: true,
      action: 'tel',
    },
    {
      id: 'hk-lifeline',
      name: '生命热线 2382 0000',
      number: '23820000',
      type: 'hotline',
      description: '24小时预防自杀热线，提供无条件倾听与支持',
      verified: true,
      action: 'tel',
    },
  ],
  MO: [
    {
      id: 'mo-999',
      name: '澳门紧急求助 999',
      number: '999',
      type: 'emergency',
      description: '澳门治安警察局及消防局紧急求助专线',
      verified: true,
      action: 'tel',
    },
    {
      id: 'mo-caritas',
      name: '澳门明爱生命热线',
      number: '28525222',
      type: 'hotline',
      description: '24小时情绪困扰辅导及自杀防治热线',
      verified: true,
      action: 'tel',
    },
  ],
  TW: [
    {
      id: 'tw-119',
      name: '紧急救护与消防 119',
      number: '119',
      type: 'emergency',
      description: '紧急伤病救护与火警专线',
      verified: true,
      action: 'tel',
    },
    {
      id: 'tw-1925',
      name: '安心专线 1925',
      number: '1925',
      type: 'hotline',
      description: '台湾卫生福利部24小时免付费心理咨询专线',
      verified: true,
      action: 'tel',
    },
    {
      id: 'tw-1995',
      name: '生命线 1995',
      number: '1995',
      type: 'hotline',
      description: '24小时协谈辅导专线',
      verified: true,
      action: 'tel',
    },
  ],
  OTHER: [
    {
      id: 'intl-befrienders',
      name: 'Befrienders Worldwide 国际情绪支持',
      number: 'https://www.befrienders.org',
      type: 'hotline',
      description: '全球预防自杀支持网络，覆盖全球多国自杀危机干预中心列表',
      verified: true,
      action: 'link',
      url: 'https://www.befrienders.org',
    },
    {
      id: 'intl-findahelpline',
      name: 'Find A Helpline 全球危机热线索引',
      number: 'https://findahelpline.com',
      type: 'hotline',
      description: '免费、机密的全球在线心理危机求助热线索引与即时求助向导',
      verified: true,
      action: 'link',
      url: 'https://findahelpline.com',
    },
  ],
};

export const UNIVERSAL_SOS_GUIDANCE = [
  '手机系统紧急求救：多数智能手机连续快速按电源键 5 次可自动呼叫当地法定紧急求救号码（Emergency SOS）并发送位置给紧急联系人。',
  '前往安全现实场所：如果感到无法自我控制，请立即前往身边最近的医院急诊室、警务室，或移步至有人在的公共明亮场所。',
  '联系现实信任的亲友：树洞提供现实交接便签，可快速复制给身边信任的家人、朋友或同事寻求陪同。',
];

export function getRegionalSafetyResources(regionCode?: string): RegionalSafetyPayload {
  const norm = (regionCode ?? '').trim().toUpperCase();
  const isSupported = norm in REGIONAL_SAFETY_RESOURCES;
  const region = isSupported ? norm : 'UNKNOWN';
  const regionItem = SUPPORTED_SAFETY_REGIONS.find((r) => r.code === region);
  const regionName = regionItem ? regionItem.name : '未知地区 (需选择地区)';

  return {
    region,
    regionName,
    isUnknownRegion: region === 'UNKNOWN',
    universalGuidance: UNIVERSAL_SOS_GUIDANCE,
    resources: isSupported ? REGIONAL_SAFETY_RESOURCES[region] : [],
    supportedRegions: SUPPORTED_SAFETY_REGIONS,
  };
}
