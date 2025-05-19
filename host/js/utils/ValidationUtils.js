/**
 * 验证IP地址格式
 * @param {string} ip - IP地址
 * @returns {boolean} - 是否合法
 */
export function isValidIp (ip) {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  return ipRegex.test(ip);
}

/**
 * 验证域名格式
 * @param {string} domain - 域名
 * @returns {boolean} - 是否合法
 */
export function isValidDomain (domain) {
  // 简单验证：域名不为空
  return domain && domain.trim().length > 0;
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