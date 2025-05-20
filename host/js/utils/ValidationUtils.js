/**
 * 验证工具类
 * 提供 IP 地址、域名、端口等验证功能
 */

/**
 * 验证 IPv4 地址格式，检查每个段的数值范围
 * @param {string} ip - IP 地址
 * @returns {boolean} - 是否合法
 */
export function isValidIp (ip) {
  if (!ip || typeof ip !== 'string') return false;

  // 基本格式检查
  const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipRegex);

  if (!match) return false;

  // 检查每个段是否在有效范围 (0-255)
  return match.slice(1).every(segment => {
    const num = parseInt(segment, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * 验证 IPv6 地址格式
 * @param {string} ip - IPv6 地址
 * @returns {boolean} - 是否合法
 */
export function isValidIpv6 (ip) {
  if (!ip || typeof ip !== 'string') return false;

  // IPv6 地址验证正则
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^[0-9a-fA-F]{1,4}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$|^[0-9a-fA-F]{1,4}:[0-9a-fA-F]{1,4}::(?:[0-9a-fA-F]{1,4}:){0,4}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){0,2}[0-9a-fA-F]{1,4}::(?:[0-9a-fA-F]{1,4}:){0,3}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){0,3}[0-9a-fA-F]{1,4}::(?:[0-9a-fA-F]{1,4}:){0,2}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){0,4}[0-9a-fA-F]{1,4}::(?:[0-9a-fA-F]{1,4}:)?[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}::[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}::$/;

  return ipv6Regex.test(ip);
}

/**
 * 验证任意 IP 地址 (IPv4 或 IPv6)
 * @param {string} ip - IP 地址
 * @returns {boolean} - 是否合法
 */
export function isValidIpAddress (ip) {
  return isValidIp(ip) || isValidIpv6(ip);
}

/**
 * 验证域名格式
 * @param {string} domain - 域名
 * @returns {boolean} - 是否合法
 */
export function isValidDomain (domain) {
  if (!domain || typeof domain !== 'string') return false;

  // 去除首尾空格
  domain = domain.trim();

  // 验证域名 (RFC 1035, RFC 1123, RFC 2181)
  // 允许常规域名、IDN（国际化域名）和通配符域名 (*.example.com)
  const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

  // 如果域名包含非ASCII字符，检查是否为有效的国际化域名
  if (domain.includes('xn--')) {
    try {
      // 将 Punycode 转换为 Unicode 并检查长度
      const decodedDomain = domain
        .split('.')
        .map(part => {
          if (part.startsWith('xn--')) {
            try {
              // 这里只是检查格式，实际上并不执行解码
              return part;
            } catch (e) {
              return part;
            }
          }
          return part;
        })
        .join('.');

      return domainRegex.test(decodedDomain);
    } catch (e) {
      return false;
    }
  }

  // 检查常规域名
  if (!domainRegex.test(domain)) {
    // 特殊情况：本地域名 (.local)
    if (/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.local$/.test(domain)) {
      return true;
    }
    return false;
  }

  // 检查域名长度
  if (domain.length > 253) {
    return false;
  }

  // 检查每个标签的长度
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length > 63) {
      return false;
    }
  }

  return true;
}

/**
 * 验证主机地址 (IP或域名)
 * @param {string} host - 主机地址
 * @returns {boolean} - 是否合法
 */
export function isValidHost (host) {
  return isValidIpAddress(host) || isValidDomain(host);
}

/**
 * 验证端口号
 * @param {string|number} port - 端口号
 * @returns {boolean} - 是否合法
 */
export function isValidPort (port) {
  if (typeof port === 'string') {
    port = parseInt(port, 10);
  }

  if (isNaN(port)) return false;

  return port >= 1 && port <= 65535;
}

/**
 * 验证主机规则
 * @param {string} ip - IP地址
 * @param {string} domain - 域名
 * @returns {boolean} - 是否合法
 */
export function isValidHostRule (ip, domain) {
  return isValidIp(ip) && isValidDomain(domain);
}

/**
 * 验证SOCKS代理配置
 * @param {object} proxy - 代理配置对象
 * @returns {boolean} - 是否合法
 */
export function isValidSocksProxy (proxy) {
  if (!proxy) return false;

  // 如果代理未启用，则不进行验证
  if (!proxy.enabled) return true;

  // 验证主机和端口
  if (!isValidHost(proxy.host) || !isValidPort(proxy.port)) {
    return false;
  }

  // 如果启用了认证，验证用户名和密码
  if (proxy.auth && proxy.auth.enabled) {
    return (
      typeof proxy.auth.username === 'string' &&
      proxy.auth.username.length > 0 &&
      typeof proxy.auth.password === 'string' &&
      proxy.auth.password.length > 0
    );
  }

  return true;
}

/**
 * 从文本解析主机规则
 * @param {string} text - 规则文本，格式为 "IP域名"
 * @returns {object|null} - 解析结果 {ip, domain} 或 null（如果无效）
 */
export function parseHostRule (text) {
  if (!text || typeof text !== 'string') return null;

  // 移除注释
  const commentIndex = text.indexOf('#');
  if (commentIndex !== -1) {
    text = text.substring(0, commentIndex);
  }

  // 分割并移除多余空格
  const parts = text.trim().split(/\s+/);

  if (parts.length < 2) return null;

  const ip = parts[0];
  const domain = parts[1];

  if (isValidHostRule(ip, domain)) {
    return { ip, domain };
  }

  return null;
}

/**
 * 解析批量规则文本并返回有效规则
 * @param {string} batchText - 批量规则文本，每行一条
 * @returns {object} - 解析结果 {valid: [{ip, domain}], invalid: [string]}
 */
export function parseBatchRules (batchText) {
  if (!batchText || typeof batchText !== 'string') {
    return { valid: [], invalid: [] };
  }

  const lines = batchText.split('\n');
  const result = {
    valid: [],
    invalid: []
  };

  for (const line of lines) {
    // 跳过空行
    if (!line.trim()) continue;

    // 跳过注释行
    if (line.trim().startsWith('#')) continue;

    const rule = parseHostRule(line);
    if (rule) {
      result.valid.push(rule);
    } else {
      result.invalid.push(line.trim());
    }
  }

  return result;
}

/**
 * 验证IP地址是否在特定范围内
 * @param {string} ip - IP地址
 * @param {string} networkMask - 网络掩码（CIDR格式，如 192.168.1.0/24）
 * @returns {boolean} - 是否在范围内
 */
export function isIpInRange (ip, networkMask) {
  if (!isValidIp(ip)) return false;

  const parts = networkMask.split('/');
  if (parts.length !== 2) return false;

  const networkIp = parts[0];
  const maskBits = parseInt(parts[1], 10);

  if (!isValidIp(networkIp) || isNaN(maskBits) || maskBits < 0 || maskBits > 32) {
    return false;
  }

  // 将IP转换为32位整数
  function ipToInt (ipAddr) {
    const parts = ipAddr.split('.');
    return ((parseInt(parts[0], 10) << 24) |
      (parseInt(parts[1], 10) << 16) |
      (parseInt(parts[2], 10) << 8) |
      parseInt(parts[3], 10)) >>> 0;
  }

  const ipInt = ipToInt(ip);
  const networkIpInt = ipToInt(networkIp);
  const mask = ~(0xFFFFFFFF >>> maskBits);

  return (ipInt & mask) === (networkIpInt & mask);
}

/**
 * 格式化IP地址（验证并标准化）
 * @param {string} ip - IP地址
 * @returns {string|null} - 格式化后的IP或null（如果无效）
 */
export function formatIp (ip) {
  if (!isValidIp(ip)) return null;

  return ip.split('.')
    .map(part => parseInt(part, 10).toString())
    .join('.');
}

/**
 * 格式化域名（转换为小写并验证）
 * @param {string} domain - 域名
 * @returns {string|null} - 格式化后的域名或null（如果无效）
 */
export function formatDomain (domain) {
  if (!isValidDomain(domain)) return null;

  return domain.toLowerCase();
}

/**
 * 规范化主机规则
 * @param {string} ip - IP地址
 * @param {string} domain - 域名
 * @returns {object|null} - 规范化的 {ip, domain} 或 null（如果无效）
 */
export function normalizeHostRule (ip, domain) {
  const formattedIp = formatIp(ip);
  const formattedDomain = formatDomain(domain);

  if (formattedIp && formattedDomain) {
    return {
      ip: formattedIp,
      domain: formattedDomain
    };
  }

  return null;
}