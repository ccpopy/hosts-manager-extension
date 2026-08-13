/**
 * Socket 代理配置仓库
 * 负责多配置的规范化、旧数据迁移和当前配置解析
 */

export const PROXY_STORE_SCHEMA_VERSION = 2;

export const DEFAULT_PROXY_CONFIG = {
  host: '',
  port: '',
  enabled: false,
  protocol: 'SOCKS5',
  auth: {
    enabled: false,
    username: '',
    password: ''
  },
  bypassList: []
};

export const DEFAULT_PROXY_STORE = {
  schemaVersion: PROXY_STORE_SCHEMA_VERSION,
  enabled: false,
  activeProfileId: null,
  profiles: []
};

export const SUPPORTED_PROXY_PROTOCOLS = new Set(['SOCKS5', 'SOCKS4', 'SOCKS', 'HTTP', 'HTTPS']);
const MAX_PROFILE_ID_LENGTH = 128;
const MAX_PROFILE_NAME_LENGTH = 50;
const MAX_PROXY_HOST_LENGTH = 253;
const MAX_AUTH_VALUE_LENGTH = 1024;
const MAX_BYPASS_RULES = 1000;
const MAX_BYPASS_RULE_LENGTH = 253;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function normalizeBypassList(rules) {
  if (!Array.isArray(rules)) return [];

  const seen = new Set();
  return rules.reduce((result, rule) => {
    const value = normalizeString(rule).toLowerCase();
    if (!value || seen.has(value)) return result;
    seen.add(value);
    result.push(value);
    return result;
  }, []);
}

/**
 * 规范化单个代理配置
 * @param {object} profile - 原始配置
 * @param {object} [options] - 规范化选项
 * @returns {object} 规范化后的配置
 */
export function normalizeProxyProfile(profile, options = {}) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const protocol = normalizeString(source.protocol).toUpperCase();
  const fallbackId = options.fallbackId || 'proxy';
  const id = normalizeString(source.id) || fallbackId;
  const name = normalizeString(source.name) || options.fallbackName || '未命名代理';

  return {
    id,
    name,
    host: normalizeString(source.host),
    port: normalizeString(source.port),
    protocol: SUPPORTED_PROXY_PROTOCOLS.has(protocol) ? protocol : 'SOCKS5',
    auth: {
      enabled: !!source.auth?.enabled,
      username: normalizeString(source.auth?.username),
      password: typeof source.auth?.password === 'string' ? source.auth.password : ''
    },
    bypassList: normalizeBypassList(source.bypassList)
  };
}

/**
 * 检查代理配置是否可安全应用到 PAC 脚本
 * @param {object} profile - 已规范化的配置
 * @returns {boolean} 是否可以启用
 */
export function isUsableProxyProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;

  const host = normalizeString(profile.host);
  const unwrappedHost = host.startsWith('[') && host.endsWith(']')
    ? host.slice(1, -1)
    : host;
  const port = normalizeString(profile.port);
  const portNumber = Number(port);

  const validHost = isValidProxyHost(unwrappedHost);
  const validPort = /^\d{1,5}$/.test(port) &&
    Number.isInteger(portNumber) &&
    portNumber >= 1 &&
    portNumber <= 65535;

  return validHost && validPort && SUPPORTED_PROXY_PROTOCOLS.has(profile.protocol);
}

function isValidProxyHost(host) {
  if (!host || host.length > MAX_PROXY_HOST_LENGTH) return false;

  if (host.includes(':')) return isValidIpv6Literal(host);

  if (/^\d+(?:\.\d+){3}$/.test(host)) {
    return host.split('.').every(segment => {
      if (!/^\d{1,3}$/.test(segment)) return false;
      const value = Number(segment);
      return value >= 0 && value <= 255;
    });
  }

  const labels = host.split('.');
  return labels.every(label =>
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  );
}

function isValidIpv6Literal(host) {
  if (!/^[0-9a-f:]+$/i.test(host) || host.includes(':::')) return false;
  if ((host.match(/::/g) || []).length > 1) return false;

  const hasCompression = host.includes('::');
  const groups = hasCompression
    ? host.split('::').flatMap(part => part ? part.split(':') : [])
    : host.split(':');

  if (groups.some(group => !/^[0-9a-f]{1,4}$/i.test(group))) return false;
  return hasCompression ? groups.length < 8 : groups.length === 8;
}

/**
 * 检查代理配置中的数据是否符合持久化约束
 * @param {object} profile - 已规范化的配置
 * @returns {boolean} 是否有效
 */
export function isValidProxyProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;
  if (!normalizeString(profile.id) || !normalizeString(profile.name)) return false;
  if (!isUsableProxyProfile(profile)) return false;

  if (profile.auth?.enabled) {
    return normalizeString(profile.auth.username) !== '' &&
      typeof profile.auth.password === 'string' &&
      profile.auth.password !== '';
  }
  return true;
}

/**
 * 检查配置字段是否安全；允许未填写主机和端口的草稿配置
 * @param {object} profile - 已规范化的配置
 * @returns {boolean} 是否可安全持久化
 */
export function isSafeProxyProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;
  const id = normalizeString(profile.id);
  const name = normalizeString(profile.name);
  if (!id || id.length > MAX_PROFILE_ID_LENGTH ||
    !name || name.length > MAX_PROFILE_NAME_LENGTH) return false;

  const host = normalizeString(profile.host);
  const port = normalizeString(profile.port);
  if (host.length > MAX_PROXY_HOST_LENGTH) return false;
  if ((host || port) && !isUsableProxyProfile(profile)) return false;

  if (normalizeString(profile.auth?.username).length > MAX_AUTH_VALUE_LENGTH ||
    String(profile.auth?.password ?? '').length > MAX_AUTH_VALUE_LENGTH) return false;

  if (!Array.isArray(profile.bypassList) || profile.bypassList.length > MAX_BYPASS_RULES ||
    profile.bypassList.some(rule => typeof rule !== 'string' || rule.length > MAX_BYPASS_RULE_LENGTH)) {
    return false;
  }

  if (profile.auth?.enabled) {
    return normalizeString(profile.auth.username) !== '' &&
      typeof profile.auth.password === 'string' &&
      profile.auth.password !== '';
  }
  return true;
}

function makeUniqueProfileId(id, usedIds) {
  const baseId = normalizeString(id) || 'proxy';
  if (!usedIds.has(baseId)) return baseId;

  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) suffix++;
  return `${baseId}-${suffix}`;
}

function hasLegacyProxyData(legacyProxy) {
  if (!legacyProxy || typeof legacyProxy !== 'object') return false;

  return !!(
    normalizeString(legacyProxy.host) ||
    normalizeString(legacyProxy.port) ||
    legacyProxy.enabled ||
    (normalizeString(legacyProxy.protocol).toUpperCase() &&
      normalizeString(legacyProxy.protocol).toUpperCase() !== 'SOCKS5') ||
    legacyProxy.auth?.enabled ||
    normalizeString(legacyProxy.auth?.username) ||
    (typeof legacyProxy.auth?.password === 'string' && legacyProxy.auth.password !== '') ||
    (Array.isArray(legacyProxy.bypassList) && legacyProxy.bypassList.length > 0)
  );
}

/**
 * 规范化代理配置仓库；旧版单配置会迁移为“默认代理”
 * @param {object} rawStore - 原始仓库
 * @param {object} [legacyProxy] - 旧版 socketProxy
 * @returns {object} v2 配置仓库
 */
export function normalizeProxyStore(rawStore, legacyProxy) {
  if (!rawStore || !Array.isArray(rawStore.profiles)) {
    if (!hasLegacyProxyData(legacyProxy)) {
      return { ...DEFAULT_PROXY_STORE, profiles: [] };
    }

    const profile = normalizeProxyProfile(legacyProxy, {
      fallbackId: 'default',
      fallbackName: '默认代理'
    });

    return {
      schemaVersion: PROXY_STORE_SCHEMA_VERSION,
      enabled: !!legacyProxy.enabled,
      activeProfileId: profile.id,
      profiles: [profile]
    };
  }

  const usedIds = new Set();
  const originalToNormalizedId = new Map();
  const profiles = rawStore.profiles.reduce((result, profile, index) => {
    if (!profile || typeof profile !== 'object') return result;

    const originalId = normalizeString(profile.id);
    const fallbackId = `proxy-${index + 1}`;
    const uniqueId = makeUniqueProfileId(originalId || fallbackId, usedIds);
    usedIds.add(uniqueId);
    if (originalId && !originalToNormalizedId.has(originalId)) {
      originalToNormalizedId.set(originalId, uniqueId);
    }

    result.push(normalizeProxyProfile({ ...profile, id: uniqueId }, {
      fallbackId: uniqueId,
      fallbackName: `代理 ${index + 1}`
    }));
    return result;
  }, []);

  const requestedActiveId = normalizeString(rawStore.activeProfileId);
  const activeProfileId = originalToNormalizedId.get(requestedActiveId) ||
    (usedIds.has(requestedActiveId) ? requestedActiveId : null);

  return {
    schemaVersion: PROXY_STORE_SCHEMA_VERSION,
    enabled: !!rawStore.enabled && activeProfileId !== null,
    activeProfileId,
    profiles
  };
}

/**
 * 比较两个配置仓库是否具有相同内容
 * @param {object} left - 配置仓库
 * @param {object} right - 配置仓库
 * @returns {boolean} 是否相同
 */
export function areProxyStoresEqual(left, right) {
  return JSON.stringify(normalizeProxyStore(left)) === JSON.stringify(normalizeProxyStore(right));
}

/**
 * 将配置仓库解析为旧版运行时可用的单配置
 * 活动配置丢失时保持禁用，不自动选择其他配置
 * @param {object} store - v2 配置仓库
 * @returns {object} 当前有效配置
 */
export function resolveActiveProxy(store) {
  const normalizedStore = normalizeProxyStore(store);
  const activeProfile = normalizedStore.profiles.find(
    profile => profile.id === normalizedStore.activeProfileId
  );

  if (!activeProfile) {
    return {
      ...DEFAULT_PROXY_CONFIG,
      auth: { ...DEFAULT_PROXY_CONFIG.auth },
      bypassList: []
    };
  }

  return {
    host: activeProfile.host,
    port: activeProfile.port,
    enabled: !!normalizedStore.enabled && isUsableProxyProfile(activeProfile),
    protocol: activeProfile.protocol,
    auth: { ...activeProfile.auth },
    bypassList: [...activeProfile.bypassList]
  };
}

/**
 * 生成本地唯一的代理配置 ID
 * @returns {string} 配置 ID
 */
export function createProxyProfileId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
