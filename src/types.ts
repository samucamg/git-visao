export type TemplateType =
  | 'app-tool'
  | 'self-hosted-saas'
  | 'infra-gateway'
  | 'dev-lib-cli'
  | 'ai-agent-automation';

export type CategoryName =
  | 'Agentes & Automação IA'
  | 'SaaS & CRM Self-Hosted'
  | 'Infra, Gateways & Edge'
  | 'Terminal, CLI & DX'
  | 'Frontend & UI Components'
  | 'Scrapers & Engenharia de Dados'
  | 'Cibersegurança & Pentest'
  | 'Apps & Produtividade'
  | 'Backend, Bancos & Storage'
  | 'Libs, SDKs & CLI Dev'
  | 'Outros';

export type LicenseType = 'permissive' | 'copyleft' | 'source-available' | 'unlicensed' | 'unspecified';
export type CostModel = 'free-local' | 'byok' | 'freemium' | 'paid-external' | 'unknown';
export type DeployDifficulty = 'easy' | 'medium' | 'advanced';

export interface Env {
  DB: D1Database;
  GITVISAO_KV?: KVNamespace;
  OMNI_KEYS?: KVNamespace;
  ADMIN_PASSWORD?: string;
  OMNIROUTE_BASE_URL?: string;
  OMNIROUTE_API_KEY?: string;
  OMNIROUTE_MODEL?: string;
  GITHUB_TOKEN?: string;
  PUBLIC_APP_TITLE?: string;
}

export interface RuntimeSettings {
  adminPassword: string;
  usingDefaultPassword: boolean;
  omnirouteBaseUrl: string;
  omnirouteApiKey: string;
  omnirouteModel: string;
  githubToken: string;
  publicAppTitle: string;
}

export interface GitHubRepoMetadata {
  repoKey: string;
  fullName: string;
  owner: string;
  name: string;
  repoUrl: string;
  description: string;
  stars: number;
  forks: number;
  language: string;
  topics: string[];
  lastCommitAt: string;
  readmeExcerpt: string;
  licenseSpdx?: string;
  licenseType?: LicenseType;
  licenseBadge?: string;
  isFree?: boolean;
  costModel?: CostModel;
  costBadge?: string;
  costNotes?: string;
  deployDifficulty?: DeployDifficulty;
  deployBadge?: string;
  deployMethod?: string;
  license_spdx?: string;
  license_type?: LicenseType;
  license_badge?: string;
  is_free?: number;
  cost_model?: CostModel;
  cost_badge?: string;
  cost_notes?: string;
  deploy_difficulty?: DeployDifficulty;
  deploy_badge?: string;
  deploy_method?: string;
  isHarmful?: boolean;
  harmReason?: string;
  is_harmful?: number;
  harm_reason?: string;
}

export interface GeneratedVisaoSummary {
  category: CategoryName;
  templateType: TemplateType;
  hookTitle: string;
  introText: string;
  warningNote?: string;
  features: string[];
  scenarioTitle: string;
  scenarioIntro: string;
  scenarioPrompt: string;
  scenarioSteps: string[];
  scenarioOutro?: string;
  killerTitle: string;
  killerText: string;
  summaryText: string;
  punchline: string;
  whatsappText: string;
  licenseBadge?: string;
  costBadge?: string;
  costNotes?: string;
  deployBadge?: string;
  deployMethod?: string;
  licenseSpdx?: string;
  licenseType?: LicenseType;
  isFree?: boolean;
  costModel?: CostModel;
  deployDifficulty?: DeployDifficulty;
  license_spdx?: string;
  license_type?: LicenseType;
  license_badge?: string;
  is_free?: number;
  cost_model?: CostModel;
  cost_badge?: string;
  cost_notes?: string;
  deploy_difficulty?: DeployDifficulty;
  deploy_badge?: string;
  deploy_method?: string;
  isHarmful?: boolean;
  harmReason?: string;
  is_harmful?: number;
  harm_reason?: string;
}

export interface RepoRecord {
  id: number;
  repo_key: string;
  full_name: string;
  owner: string;
  name: string;
  repo_url: string;
  description: string;
  stars: number;
  forks: number;
  language: string;
  topics_json: string;
  last_commit_at: string;
  category: CategoryName;
  template_type: TemplateType;
  hook_title: string;
  intro_text: string;
  warning_note: string;
  features_json: string;
  scenario_title: string;
  scenario_intro: string;
  scenario_prompt: string;
  scenario_steps_json: string;
  scenario_outro: string;
  killer_title: string;
  killer_text: string;
  summary_text: string;
  punchline: string;
  whatsapp_text: string;
  created_at: string;
  updated_at: string;
}
