import { seoChecks } from './seo';
import { securityChecks } from './security';
import { documentChecks } from './document';
export const checks = [...seoChecks, ...securityChecks, ...documentChecks];
