import type { Finding } from '../../../src/core/types';
import type { DesktopLocale } from '../i18n';

type FindingCopy = Pick<Finding, 'title' | 'evidence' | 'why_it_matters' | 'reproduction' | 'recommendation' | 'remediation'>;
const lookup = (dictionary: Record<string, string>, key: string) => Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;

const titles: Record<string, string> = {
  'seo.title': 'Título descritivo da página', 'seo.description': 'Descrição para mecanismos de busca', 'seo.canonical': 'URL canônica', 'seo.indexability': 'Página de produção indexável', 'seo.h1': 'Título principal claro', 'seo.headings': 'Hierarquia de títulos',
  'seo.og-title': 'Metadados sociais og:title', 'seo.og-description': 'Metadados sociais og:description', 'seo.og-url': 'Metadados sociais og:url', 'seo.og-image': 'Metadados sociais og:image', 'seo.twitter': 'Metadados do Twitter Card', 'seo.structured-data': 'Sintaxe dos dados estruturados', 'seo.link-labels': 'Nomes de links informativos',
  'security.https': 'Conexão criptografada', 'security.strict-transport-security': 'Política HSTS', 'security.content-security-policy': 'Política de segurança de conteúdo', 'security.x-content-type-options': 'Proteção contra detecção de tipo MIME', 'security.referrer-policy': 'Política de referência', 'security.permissions-policy': 'Política de permissões do navegador', 'security.csp-quality': 'Restrições de scripts na CSP', 'security.framing': 'Restrições de incorporação em frames', 'security.cookies': 'Atributos de segurança dos cookies', 'security.mixed-content': 'Recursos da página protegidos', 'security.disclosure': 'Exposição da versão do servidor', 'security.cors': 'Política de acesso entre origens', 'security.tls-expiry': 'Validade do certificado',
  'accessibility.language': 'Idioma do documento', 'accessibility.alt': 'Textos alternativos das imagens', 'accessibility.form-labels': 'Rótulos dos campos do formulário', 'accessibility.landmarks': 'Marco do conteúdo principal', 'accessibility.duplicate-ids': 'IDs de elementos exclusivos',
  'ux.viewport': 'Área de visualização para dispositivos móveis', 'ux.zoom': 'Zoom do usuário disponível', 'ux.form-transport': 'Envio seguro de formulários', 'production.placeholders': 'Conteúdo provisório visível', 'production.local-urls': 'Origens de recursos em produção', 'production.favicon': 'Ícone do navegador', 'production.manifest': 'Manifesto do aplicativo',
  'reliability.http': 'Resposta da página', 'performance.ttfb': 'Resposta inicial do documento', 'performance.image-dimensions': 'Dimensões reservadas para imagens', 'performance.compression': 'Compactação do documento',
  'seo.robots': 'Diretrizes para mecanismos de busca', 'seo.sitemap': 'Mapa do site', 'reliability.robots-blocked': 'Acesso do verificador limitado pelo robots.txt', 'reliability.origin-redirect': 'Redirecionamento para fora do limite da análise', 'reliability.internal-links': 'Links internos', 'reliability.internal-link-unverified': 'Verificação de link interno incompleta', 'reliability.connection': 'Conexão com a página',
  'runtime.exceptions': 'Exceções não tratadas no navegador', 'runtime.console': 'Erros no console do navegador', 'runtime.resources': 'Respostas de recursos', 'accessibility.axe': 'Verificação automatizada de acessibilidade', 'performance.lab-vitals': 'Desempenho observado em laboratório',
};

const recommendations: Record<string, string> = {
  'Use one descriptive title of roughly 10–65 characters. Describe this page, not just the product name.': 'Use um título descritivo, com cerca de 10 a 65 caracteres. Descreva esta página, não apenas o nome do produto.',
  'Add a useful page-specific meta description, generally 50–170 characters.': 'Adicione uma meta descrição útil e específica para a página, geralmente com 50 a 170 caracteres.',
  'Add a single absolute canonical URL matching the intended production origin.': 'Adicione uma única URL canônica absoluta que corresponda à origem de produção desejada.',
  'Remove noindex if this public page should appear in search. Private dashboards may intentionally remain excluded; verify the page purpose.': 'Remova noindex se esta página pública deve aparecer nas buscas. Painéis privados podem permanecer excluídos; confirme a finalidade da página.',
  'Use one clear main heading. Multiple H1s are a structural recommendation, not a launch blocker.': 'Use um único título principal claro. Vários H1 são uma recomendação estrutural, não um impedimento para o lançamento.',
  'Avoid skipping heading levels when structuring sections.': 'Evite pular níveis de títulos ao organizar as seções.',
  'Add twitter:card if rich social previews matter to this project.': 'Adicione twitter:card se prévias detalhadas nas redes sociais forem importantes para este projeto.',
  'Validate JSON-LD syntax, then verify vocabulary and required fields with the relevant schema validator.': 'Valide a sintaxe JSON-LD e confira o vocabulário e os campos obrigatórios com o validador de esquema apropriado.',
  'Give each link a meaningful accessible name.': 'Dê a cada link um nome acessível e significativo.',
  'Serve production over HTTPS with a valid certificate, and redirect HTTP to HTTPS.': 'Use HTTPS em produção com um certificado válido e redirecione HTTP para HTTPS.',
  'Set an appropriate {header} response header at the application or reverse proxy.': 'Configure o cabeçalho de resposta {header} adequado no aplicativo ou no proxy reverso.',
  'Prefer nonces or hashes for scripts. Avoid unsafe-eval and wildcard script sources. Test a report-only policy before enforcement.': 'Prefira nonces ou hashes para scripts. Evite unsafe-eval e origens curinga para scripts. Teste a política em modo de relatório antes de aplicá-la.',
  'Set CSP frame-ancestors to an explicit allowlist or none to reduce clickjacking risk.': 'Defina CSP frame-ancestors com uma lista explícita de origens permitidas ou none para reduzir o risco de clickjacking.',
  'Use Secure and an appropriate SameSite policy. Use HttpOnly for session cookies; JavaScript-readable preference cookies may intentionally omit it.': 'Use Secure e uma política SameSite adequada. Use HttpOnly em cookies de sessão; cookies de preferência acessíveis por JavaScript podem omiti-lo intencionalmente.',
  'Serve scripts, styles, fonts and images over HTTPS.': 'Carregue scripts, estilos, fontes e imagens por HTTPS.',
  'Remove unnecessary framework and detailed version headers.': 'Remova cabeçalhos desnecessários que revelem o framework e sua versão detalhada.',
  'For credentialed requests use explicit trusted origins. Wildcard plus credentials is invalid and browsers reject it.': 'Em solicitações autenticadas, use origens confiáveis explícitas. Curinga junto com credenciais é inválido e os navegadores o rejeitam.',
  'Automate certificate renewal and alert before expiry.': 'Automatize a renovação do certificado e configure alertas antes do vencimento.',
  'Set the correct BCP 47 language on the html element.': 'Defina o idioma BCP 47 correto no elemento html.',
  'Describe meaningful images with alt text. Decorative images should use an empty alt attribute.': 'Descreva imagens relevantes com texto alternativo. Imagens decorativas devem usar o atributo alt vazio.',
  'Associate labels with field IDs or use a meaningful accessible name.': 'Associe os rótulos aos IDs dos campos ou use um nome acessível significativo.',
  'Mark the primary content with one main element.': 'Marque o conteúdo principal com um único elemento main.',
  'Use unique IDs to keep labels, anchors and ARIA references unambiguous.': 'Use IDs exclusivos para manter claros os rótulos, âncoras e referências ARIA.',
  'Use width=device-width, initial-scale=1. Do not disable user zoom.': 'Use width=device-width, initial-scale=1. Não desative o zoom do usuário.',
  'Allow users to zoom. Remove user-scalable=no and restrictive maximum-scale.': 'Permita que as pessoas ampliem a página. Remova user-scalable=no e valores restritivos de maximum-scale.',
  'Submit forms over HTTPS. Inspect actual server responses in an authorized journey test.': 'Envie formulários por HTTPS. Confira as respostas reais do servidor em um teste autorizado de jornada.',
  'Replace placeholder copy before launch. Confirm these matches are not intentional documentation examples.': 'Substitua textos provisórios antes do lançamento. Confirme se as ocorrências não são exemplos intencionais da documentação.',
  'Point production resources and APIs to publicly reachable production services.': 'Aponte os recursos e as APIs de produção para serviços de produção acessíveis publicamente.',
  'Provide a browser icon so users can identify the application.': 'Forneça um ícone de navegador para que as pessoas identifiquem o aplicativo.',
  'If this project is intended to be installable, provide and validate a web app manifest.': 'Se este projeto deve permitir instalação, forneça e valide um manifesto de aplicativo web.',
  'Ensure the page returns a successful response. Inspect server logs using the request timestamp.': 'Garanta que a página retorne uma resposta bem-sucedida. Consulte os registros do servidor pelo horário da solicitação.',
  'Inspect server response time, redirects and document size. Repeat under representative conditions.': 'Confira o tempo de resposta do servidor, os redirecionamentos e o tamanho do documento. Repita em condições representativas.',
  'Reserve image space with dimensions or aspect-ratio to reduce layout shifts.': 'Reserve espaço para as imagens com dimensões ou aspect-ratio para reduzir mudanças no layout.',
  'Enable Brotli or gzip for compressible HTML, CSS and JavaScript.': 'Ative Brotli ou gzip para compactar HTML, CSS e JavaScript.',
  'Publish intentional crawler rules in robots.txt. A missing file permits crawling by default.': 'Publique no robots.txt as regras desejadas para robôs. Sem esse arquivo, a busca é permitida por padrão.',
  'Publish a sitemap containing canonical, indexable URLs and declare it in robots.txt.': 'Publique um mapa do site com URLs canônicas e indexáveis e declare-o no robots.txt.',
  'Permit GorillaPunchBot if you intend this page to be inspected.': 'Permita o acesso do GorillaPunchBot se quiser que esta página seja analisada.',
  'Punch the final canonical URL directly. GorillaPunch will not crawl unrelated origins.': 'Analise diretamente a URL canônica final. O GorillaPunch não percorre origens sem relação com o site.',
  'Open this link in a browser to confirm it works. The server rejected the quick link check.': 'Abra este link no navegador para confirmar que funciona. O servidor rejeitou a verificação rápida.',
  'Repair or remove broken internal links.': 'Corrija ou remova os links internos quebrados.',
  'Open the link in a browser to confirm it works.': 'Abra o link no navegador para confirmar que funciona.',
  'Check domain resolution, TLS and server availability. Also check whether the site blocks crawlers.': 'Confira a resolução do domínio, o TLS e a disponibilidade do servidor. Verifique também se o site bloqueia robôs.',
  'Reproduce the error in the browser console and trace it to the application source. A navigation inspection does not verify authenticated journeys.': 'Reproduza o erro no console do navegador e rastreie sua origem no aplicativo. A análise de navegação não verifica jornadas autenticadas.',
  'Inspect these messages. Check whether third-party resources or application code caused them.': 'Investigue estas mensagens. Confira se foram causadas por recursos de terceiros ou pelo código do aplicativo.',
  'Fix failed scripts, styles and images; remove obsolete resource references.': 'Corrija scripts, estilos e imagens com falha; remova referências a recursos obsoletos.',
  'Also test keyboard navigation and assistive technology with real users.': 'Teste também a navegação por teclado e tecnologias assistivas com pessoas usuárias.',
  'Use these lab signals to investigate regressions. Confirm with repeatable Lighthouse runs and field Web Vitals.': 'Use estes indicadores de laboratório para investigar regressões. Confirme com execuções repetíveis do Lighthouse e métricas Web Vitals de campo.',
  'Inspect fixed widths, long unbroken text and off-screen navigation. Verify controls remain reachable.': 'Confira larguras fixas, textos longos sem quebras e navegação fora da tela. Verifique se os controles continuam acessíveis.',
};

const exactEvidence: Record<string, string> = {
  'No canonical link found.': 'Nenhum link canônico encontrado.', 'No noindex directive detected in headers or metadata.': 'Nenhuma diretiva noindex encontrada nos cabeçalhos ou metadados.',
  'Heading levels follow a logical sequence.': 'Os níveis de título seguem uma sequência lógica.', 'No Twitter Card declared.': 'Nenhum Twitter Card foi declarado.',
  'CSP is missing.': 'O cabeçalho CSP está ausente.', 'No frame restrictions detected.': 'Nenhuma restrição de frames detectada.',
  'No insecure resource references found.': 'Nenhuma referência a recurso inseguro encontrada.', 'No server implementation disclosed.': 'Nenhuma informação sobre a implementação do servidor foi exposta.',
  'Certificate details unavailable for this response. HTTPS requests still enforce platform certificate validation.': 'Os detalhes do certificado não estão disponíveis nesta resposta. Solicitações HTTPS ainda validam o certificado conforme a plataforma.',
  'No duplicate IDs found.': 'Nenhum ID duplicado encontrado.', 'Viewport metadata is missing.': 'Os metadados da área de visualização estão ausentes.', 'No zoom restrictions declared.': 'Nenhuma restrição de zoom declarada.',
  'No insecure form actions. No forms were submitted.': 'Nenhum formulário com envio inseguro encontrado. Nenhum formulário foi enviado.',
  'No known placeholder phrases found.': 'Nenhuma frase provisória conhecida encontrada.', 'No local resource or form origins detected.': 'Nenhuma origem local de recurso ou formulário detectada.',
  'No favicon declared.': 'Nenhum favicon declarado.', 'No application manifest declared. PWA support is optional.': 'Nenhum manifesto de aplicativo declarado. O suporte a PWA é opcional.',
  'GorillaPunch respected the applicable Disallow directive.': 'O GorillaPunch respeitou a diretiva Disallow aplicável.',
  'No uncaught JavaScript exceptions observed during navigation.': 'Nenhuma exceção JavaScript não tratada foi observada durante a navegação.', 'No console errors observed.': 'Nenhum erro no console foi observado.',
};

const dynamicTitles: Record<string, string> = {
  'Crawler directives available': 'Diretrizes para robôs disponíveis', 'robots.txt is unavailable': 'robots.txt indisponível', 'Sitemap available': 'Mapa do site disponível', 'Sitemap is unavailable or invalid': 'Mapa do site indisponível ou inválido',
  'Crawler access restricted by robots.txt': 'Acesso do verificador limitado pelo robots.txt', 'Page redirects outside the crawl boundary': 'A página redireciona para fora do limite da análise',
  'Internal link could not be verified with a quick check': 'Não foi possível verificar o link interno com uma análise rápida', 'Internal link returned an error': 'O link interno retornou um erro', 'Internal link responds: passed': 'Link interno responde: aprovado',
  'Internal link check could not complete': 'Não foi possível concluir a verificação do link interno', 'TLS connection could not be validated': 'Não foi possível validar a conexão TLS', 'The page could not be inspected': 'Não foi possível analisar a página',
  'Uncaught browser exceptions': 'Exceções não tratadas no navegador', 'Browser runtime: passed': 'Execução no navegador: aprovada', 'Browser console errors': 'Erros no console do navegador', 'Browser console: passed': 'Console do navegador: aprovado',
  'Resources returned HTTP errors': 'Recursos retornaram erros HTTP', 'Loaded resource responses: passed': 'Respostas dos recursos carregados: aprovadas', 'Automated accessibility inspection: passed': 'Verificação automatizada de acessibilidade: aprovada',
  'Lab performance needs attention': 'O desempenho em laboratório precisa de atenção', 'Observed lab performance: passed': 'Desempenho observado em laboratório: aprovado',
};

const axeTitles: Record<string, string> = {
  'aria-allowed-attr': 'Atributos ARIA permitidos', 'aria-required-attr': 'Atributos ARIA obrigatórios', 'aria-valid-attr-value': 'Valores válidos para atributos ARIA', 'aria-hidden-focus': 'Elementos focáveis ocultos de tecnologias assistivas',
  'aria-input-field-name': 'Nome acessível do campo de entrada', 'aria-command-name': 'Nome acessível do controle', 'aria-dialog-name': 'Nome acessível da caixa de diálogo', 'aria-prohibited-attr': 'Atributo ARIA não permitido',
  'button-name': 'Nome acessível dos botões', 'color-contrast': 'Contraste de cores', 'document-title': 'Título do documento', 'duplicate-id': 'IDs duplicados', 'html-has-lang': 'Idioma do documento',
  'image-alt': 'Texto alternativo das imagens', 'label': 'Rótulos dos campos', 'landmark-one-main': 'Marco principal único', 'link-name': 'Nome acessível dos links', 'list': 'Estrutura de listas', 'listitem': 'Itens de lista',
  'meta-viewport': 'Configuração da área de visualização', 'nested-interactive': 'Controles interativos aninhados', 'region': 'Conteúdo dentro de regiões', 'role-img-alt': 'Texto alternativo de imagens com função ARIA', 'select-name': 'Nome acessível dos menus de seleção',
  'table-duplicate-name': 'Nomes exclusivos para tabelas', 'target-size': 'Tamanho dos alvos de interação', 'heading-order': 'Ordem dos títulos', 'frame-title': 'Título dos frames', 'avoid-inline-spacing': 'Espaçamento acessível',
};
const axeRecommendations: Record<string, string> = {
  'aria-allowed-attr': 'Remova atributos ARIA que não são permitidos para a função do elemento.', 'aria-required-attr': 'Adicione os atributos ARIA obrigatórios para a função do elemento.', 'aria-valid-attr-value': 'Corrija os valores dos atributos ARIA para que sejam válidos.', 'aria-hidden-focus': 'Não deixe elementos focáveis dentro de conteúdo oculto para tecnologias assistivas.',
  'button-name': 'Dê a cada botão um nome acessível que descreva sua finalidade.', 'color-contrast': 'Ajuste as cores do texto e do fundo para atingir o contraste mínimo exigido.', 'document-title': 'Adicione um título de página descritivo e exclusivo.', 'duplicate-id': 'Use um ID exclusivo para cada elemento.', 'html-has-lang': 'Defina o idioma principal da página no elemento html.',
  'image-alt': 'Forneça texto alternativo adequado para imagens informativas e alt vazio para imagens decorativas.', 'label': 'Associe cada campo de formulário a um rótulo acessível.', 'landmark-one-main': 'Identifique o conteúdo principal com um único marco main.', 'link-name': 'Dê a cada link um nome acessível que descreva seu destino ou finalidade.',
  'list': 'Use uma estrutura válida para listas e seus itens.', 'listitem': 'Coloque cada item de lista dentro de uma lista compatível.', 'meta-viewport': 'Permita a ampliação da página e não restrinja o zoom do usuário.', 'nested-interactive': 'Evite colocar um controle interativo dentro de outro.', 'region': 'Inclua o conteúdo da página em regiões semânticas ou marcos.',
  'role-img-alt': 'Forneça um nome acessível para elementos com função img.', 'select-name': 'Dê ao menu de seleção um rótulo ou nome acessível.', 'table-duplicate-name': 'Dê nomes exclusivos às tabelas que precisam ser identificadas.', 'target-size': 'Aumente os alvos interativos ou ofereça espaçamento suficiente entre eles.', 'heading-order': 'Organize os títulos sem pular níveis.', 'frame-title': 'Dê a cada frame um título que descreva seu conteúdo.',
};
const axeEvidence: Record<string, string> = {
  'Element does not have sufficient color contrast.': 'O elemento não tem contraste de cores suficiente.', 'Images must have alternate text': 'As imagens precisam de texto alternativo.', 'Form elements must have labels': 'Os campos do formulário precisam de rótulos.',
  'Links must have discernible text': 'Os links precisam ter texto identificável.', 'Buttons must have discernible text': 'Os botões precisam ter texto identificável.', 'The document does not have a title element': 'O documento não tem um elemento de título.',
  'The page must have a language attribute': 'A página precisa ter um atributo de idioma.', 'IDs used in ARIA and labels must be unique': 'Os IDs usados em ARIA e rótulos precisam ser exclusivos.',
};

function evidenceInPortuguese(finding: Finding) {
  const evidence = finding.evidence;
  const exact = lookup(exactEvidence, evidence);
  if (exact) return exact;
  let match: RegExpMatchArray | null;
  if ((match = evidence.match(/^Title \((\d+) characters\): (.*)$/s))) return `Título (${match[1]} caracteres): ${match[2] === '(missing)' ? '(ausente)' : match[2]}`;
  if ((match = evidence.match(/^Description \((\d+) characters\): (.*)$/s))) return `Descrição (${match[1]} caracteres): ${match[2] === '(missing)' ? '(ausente)' : match[2]}`;
  if ((match = evidence.match(/^([\w:-]+) is missing\.$/))) return `A propriedade ${match[1]} está ausente.`;
  if ((match = evidence.match(/^(\d+) H1 elements detected\.$/))) return `${match[1]} elementos H1 encontrados.`;
  if ((match = evidence.match(/^(\d+) links without visible or accessible text\.$/))) return `${match[1]} links sem texto visível ou acessível.`;
  if ((match = evidence.match(/^(\d+) JSON-LD blocks inspected\.$/))) return `${match[1]} blocos JSON-LD analisados.`;
  if ((match = evidence.match(/^JSON-LD block (\d+) contains invalid JSON\.$/))) return `O bloco JSON-LD ${match[1]} contém JSON inválido.`;
  if ((match = evidence.match(/^html lang: (.*)$/s))) return `Idioma do html: ${match[1] === '(missing)' ? '(ausente)' : match[1]}`;
  if ((match = evidence.match(/^(\d+) images are missing alt attributes\.(.*)$/s))) return `${match[1]} imagens estão sem atributos alt.${match[2]}`;
  if ((match = evidence.match(/^(\d+) form fields lack associated labels\.$/))) return `${match[1]} campos de formulário estão sem rótulos associados.`;
  if ((match = evidence.match(/^(\d+) main landmarks\.$/))) return `${match[1]} marcos main.`;
  if ((match = evidence.match(/^No duplicate IDs found\.$/))) return 'Nenhum ID duplicado encontrado.';
  if ((match = evidence.match(/^([a-z-]+): (.*)$/s)) && finding.check_key.startsWith('security.')) return `Cabeçalho ${match[1]}: ${match[2] === '(missing)' ? '(ausente)' : match[2]}`;
  if ((match = evidence.match(/^(\d+) Set-Cookie headers inspected; (\d+) lack Secure or SameSite\. Values are never stored\.$/))) return `${match[1]} cabeçalhos Set-Cookie analisados; ${match[2]} não têm Secure ou SameSite. Os valores nunca são armazenados.`;
  if ((match = evidence.match(/^Allow-Origin: (.*); Allow-Credentials: (.*)$/s))) return `Allow-Origin: ${match[1]}; Allow-Credentials: ${match[2]}`;
  if ((match = evidence.match(/^Issuer: (.*); expires (.*); (-?\d+) days remaining\.$/s))) return `Emissor: ${match[1]}; vence em ${match[2]}; restam ${match[3]} dias.`;
  if ((match = evidence.match(/^robots\.txt returned HTTP (\d+)\.$/))) return `robots.txt retornou HTTP ${match[1]}.`;
  if ((match = evidence.match(/^sitemap\.xml returned HTTP (\d+)\.$/))) return `sitemap.xml retornou HTTP ${match[1]}.`;
  if ((match = evidence.match(/^Final origin: (.*)$/s))) return `Origem final: ${match[1]}`;
  if ((match = evidence.match(/^Document fetch including body: (\d+) ms\. This is a lab observation, not field TTFB\.$/))) return `Carregamento do documento, incluindo o corpo: ${match[1]} ms. Esta é uma observação de laboratório, não uma medição de TTFB em campo.`;
  if ((match = evidence.match(/^(\d+) images lack explicit width and height attributes\. CSS aspect-ratio may provide an equivalent reservation\.$/))) return `${match[1]} imagens não têm atributos explícitos de largura e altura. CSS aspect-ratio pode reservar o espaço equivalente.`;
  if ((match = evidence.match(/^Encoding: (.*); decoded size (\d+) bytes\.$/s))) return `Codificação: ${match[1]}; tamanho descompactado: ${match[2]} bytes.`;
  if ((match = evidence.match(/^(\d+) Axe rules passed; (\d+) rules need manual review\. This is not a WCAG compliance certification\.$/))) return `${match[1]} regras do Axe aprovadas; ${match[2]} precisam de revisão manual. Isto não é uma certificação de conformidade com WCAG.`;
  if ((match = evidence.match(/^(\d+) responses inspected\. Requests blocked by the safety broker may reduce coverage\.$/))) return `${match[1]} respostas analisadas. Solicitações bloqueadas pelo intermediário de segurança podem reduzir a cobertura.`;
  if ((match = evidence.match(/^Viewport (\d+)px; content (\d+)px; (\d+) controls smaller than 24px \(manual review may be needed\)\.$/))) return `Área de visualização: ${match[1]} px; conteúdo: ${match[2]} px; ${match[3]} controles têm menos de 24 px (pode ser necessária uma revisão manual).`;
  if ((match = evidence.match(/^Open (.+) and inspect (.+)\. Compare the result with the captured evidence\.$/s))) return `Acesse ${match[1]} e verifique ${match[2]}. Compare o resultado com as evidências capturadas.`;
  if ((match = evidence.match(/^HTTP (\d{3})$/))) return `HTTP ${match[1]}`;
  if (finding.check_key.startsWith('accessibility.axe.')) {
    return evidence.split('\n').map(line => {
      const separator = line.indexOf(': ');
      if (separator < 0) return lookup(axeEvidence, line) || line;
      const selector = line.slice(0, separator + 2);
      const details = line.slice(separator + 2);
      return `${selector}${lookup(axeEvidence, details) || details}`;
    }).join('\n');
  }
  if ((match = evidence.match(/^LCP (\d+) ms; CLS ([\d.]+); observed long-task blocking (\d+) ms\. INP is unavailable without representative interactions\. Network broker and this short observation window affect timings\.$/))) return `LCP ${match[1]} ms; CLS ${match[2]}; bloqueio observado por tarefas longas: ${match[3]} ms. INP não está disponível sem interações representativas. O intermediário de rede e esta janela curta de observação afetam os tempos.`;
  return evidence;
}

function recommendationInPortuguese(finding: Finding) {
  const existing = lookup(recommendations, finding.recommendation);
  if (existing) return existing;
  const header = finding.recommendation.match(/^Set an appropriate ([\w-]+) response header at the application or reverse proxy\.$/);
  if (header) return `Configure o cabeçalho de resposta ${header[1]} adequado no aplicativo ou no proxy reverso.`;
  const social = finding.recommendation.match(/^Add (og:[\w-]+) for meaningful previews when a link is shared\.$/);
  if (social) return `Adicione ${social[1]} para exibir prévias úteis quando um link for compartilhado.`;
  if (finding.check_key.startsWith('accessibility.axe.')) {
    const id = finding.check_key.slice('accessibility.axe.'.length);
    const axe = lookup(axeRecommendations, id);
    if (axe) return axe;
  }
  const reference = finding.recommendation.match(/^(.*) Reference: (https?:\/\/\S+)$/s);
  if (reference) return `${reference[1]}. Referência: ${reference[2]}`;
  return finding.recommendation;
}

export function localizeFinding(finding: Finding, locale: DesktopLocale): FindingCopy {
  if (locale !== 'pt-BR') return finding;
  const viewportTitle = finding.check_key.startsWith('ux.viewport-') && finding.title.match(/^(Horizontal overflow|Layout bounds) at (\d+)px(?:: passed)?$/);
  const axeId = finding.check_key.startsWith('accessibility.axe.') ? finding.check_key.slice('accessibility.axe.'.length) : '';
  const checkTitle = lookup(axeTitles, axeId) || lookup(titles, finding.check_key);
  const title = viewportTitle
    ? `${viewportTitle[1] === 'Horizontal overflow' ? 'Conteúdo ultrapassa a largura' : 'Limites do layout'} em ${viewportTitle[2]} px${finding.severity === 'PASSED' ? ': aprovado' : ''}`
    : checkTitle
    ? `${checkTitle}${finding.severity === 'PASSED' ? ': aprovado' : ''}`
    : lookup(dynamicTitles, finding.title) || finding.title;
  const recommendation = recommendationInPortuguese(finding);
  const why = finding.why_it_matters === finding.recommendation ? recommendation : lookup(recommendations, finding.why_it_matters) || lookup(axeRecommendations, axeId) || finding.why_it_matters;
  const reproduction = finding.reproduction.replace(/^Open (.+) and inspect (.+)\. Compare the result with the captured evidence\.$/s, 'Acesse $1 e verifique $2. Compare o resultado com as evidências capturadas.');
  return {
    title,
    evidence: evidenceInPortuguese(finding),
    why_it_matters: why,
    reproduction,
    recommendation,
    remediation: lookup(recommendations, finding.remediation) || (finding.remediation === finding.recommendation ? recommendation : finding.remediation),
  };
}
