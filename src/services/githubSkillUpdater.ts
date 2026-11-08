import { NovelSkill } from '../types';
import { saveGlobalSkill } from './db';

export interface GitHubSkillOrigin {
  owner: string;
  repo: string;
  branch: string;
  skillPath: string;
  repoUrl: string;
}

export const GITHUB_SKILL_REPOSITORIES: Record<string, GitHubSkillOrigin> = {
  'novel-creator-skill': {
    owner: 'leenbj',
    repo: 'novel-creator-skill',
    branch: 'main',
    skillPath: 'SKILL.md',
    repoUrl: 'https://github.com/leenbj/novel-creator-skill',
  },
  'character-designer': {
    owner: 'zenstory-ai',
    repo: 'oh-story-claudecode',
    branch: 'main',
    skillPath: 'skills/story-setup/references/templates/agents/character-designer.md',
    repoUrl: 'https://github.com/zenstory-ai/oh-story-claudecode',
  },
  'story-long-write': {
    owner: 'zenstory-ai',
    repo: 'oh-story-claudecode',
    branch: 'main',
    skillPath: 'skills/story-long-write/SKILL.md',
    repoUrl: 'https://github.com/zenstory-ai/oh-story-claudecode',
  },
  'webnovel-write': {
    owner: 'lingfengqaq',
    repo: 'webnovel-writer',
    branch: 'master',
    skillPath: 'webnovel-writer/skills/webnovel-write/SKILL.md',
    repoUrl: 'https://github.com/lingfengqaq/webnovel-writer',
  },
  'story-deslop': {
    owner: 'zenstory-ai',
    repo: 'oh-story-claudecode',
    branch: 'main',
    skillPath: 'skills/story-deslop/SKILL.md',
    repoUrl: 'https://github.com/zenstory-ai/oh-story-claudecode',
  },
  'story-review': {
    owner: 'zenstory-ai',
    repo: 'oh-story-claudecode',
    branch: 'main',
    skillPath: 'skills/story-review/SKILL.md',
    repoUrl: 'https://github.com/zenstory-ai/oh-story-claudecode',
  },
};

export interface SkillUpdateInfo {
  skillId: string;
  slug: string;
  hasUpdate: boolean;
  currentSha: string;
  remoteSha: string;
  remoteDate: string;
  remoteMessage: string;
  repoUrl: string;
  error?: string;
}

/**
 * Checks GitHub commits API for remote updates on a skill's repository.
 */
export async function checkSingleSkillUpdate(skill: NovelSkill): Promise<SkillUpdateInfo> {
  const slug = skill.slug || skill.name;
  const origin = GITHUB_SKILL_REPOSITORIES[slug];

  if (!origin) {
    return {
      skillId: skill.id,
      slug,
      hasUpdate: false,
      currentSha: skill.githubRepo?.installedCommitSha || 'custom',
      remoteSha: '',
      remoteDate: '',
      remoteMessage: '',
      repoUrl: '',
      error: '此技能为本地自定义或第三方导入技能，非内置 GitHub 开源项目',
    };
  }

  const currentSha = skill.githubRepo?.installedCommitSha || '';

  try {
    const apiUrl = `https://api.github.com/repos/${origin.owner}/${origin.repo}/commits?path=${encodeURIComponent(
      origin.skillPath
    )}&per_page=1`;

    const res = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (res.status === 403 || res.status === 429) {
      return {
        skillId: skill.id,
        slug,
        hasUpdate: false,
        currentSha,
        remoteSha: currentSha || 'latest',
        remoteDate: new Date().toISOString(),
        remoteMessage: 'GitHub API 匿名速率限制（已保持本地稳定版本）',
        repoUrl: origin.repoUrl,
        error: 'GitHub API 请求频率达到匿名上限（60次/小时），暂未发现阻塞性更新',
      };
    }

    if (!res.ok) {
      throw new Error(`GitHub API HTTP ${res.status}: ${res.statusText}`);
    }

    const commits = await res.json();
    if (!Array.isArray(commits) || commits.length === 0) {
      return {
        skillId: skill.id,
        slug,
        hasUpdate: false,
        currentSha,
        remoteSha: currentSha || 'main',
        remoteDate: '',
        remoteMessage: '该文件近期无独立提交',
        repoUrl: origin.repoUrl,
      };
    }

    const latestCommit = commits[0];
    const remoteFullSha = latestCommit.sha || '';
    const remoteShortSha = remoteFullSha.slice(0, 7);
    const remoteDate = latestCommit.commit?.committer?.date || latestCommit.commit?.author?.date || '';
    const remoteMessage = (latestCommit.commit?.message || '').split('\n')[0].slice(0, 100);

    const isDifferent =
      Boolean(currentSha) &&
      !currentSha.startsWith(remoteShortSha) &&
      !remoteShortSha.startsWith(currentSha);

    return {
      skillId: skill.id,
      slug,
      hasUpdate: isDifferent,
      currentSha: currentSha || remoteShortSha,
      remoteSha: remoteShortSha,
      remoteDate,
      remoteMessage,
      repoUrl: origin.repoUrl,
    };
  } catch (err: any) {
    return {
      skillId: skill.id,
      slug,
      hasUpdate: false,
      currentSha,
      remoteSha: '',
      remoteDate: '',
      remoteMessage: '',
      repoUrl: origin.repoUrl,
      error: `检查更新失败: ${err.message}`,
    };
  }
}

/**
 * Checks all skills for GitHub remote updates concurrently.
 */
export async function checkAllSkillsUpdates(skills: NovelSkill[]): Promise<Record<string, SkillUpdateInfo>> {
  const results: Record<string, SkillUpdateInfo> = {};
  const promises = skills.map(async (sk) => {
    const slug = sk.slug || sk.name;
    if (GITHUB_SKILL_REPOSITORIES[slug]) {
      const info = await checkSingleSkillUpdate(sk);
      results[sk.id] = info;
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Pulls the latest raw SKILL.md from GitHub raw content CDN and updates the skill in IndexedDB.
 */
export async function updateSkillFromGithub(skill: NovelSkill): Promise<{ updatedSkill: NovelSkill; summary: string }> {
  const slug = skill.slug || skill.name;
  const origin = GITHUB_SKILL_REPOSITORIES[slug];

  if (!origin) {
    throw new Error(`未找到技能「${skill.name}」对应的 GitHub 开源仓库配置`);
  }

  const rawUrl = `https://raw.githubusercontent.com/${origin.owner}/${origin.repo}/${origin.branch}/${origin.skillPath}`;
  const res = await fetch(rawUrl);

  if (!res.ok) {
    throw new Error(`从 GitHub 拉取技能文件失败 (${res.status} ${res.statusText})`);
  }

  const rawText = await res.text();
  if (!rawText.trim()) {
    throw new Error('从 GitHub 获取的内容为空');
  }

  // Get latest commit sha if available
  let latestSha = skill.githubRepo?.installedCommitSha || '';
  let latestDate = new Date().toISOString();
  try {
    const commitRes = await fetch(
      `https://api.github.com/repos/${origin.owner}/${origin.repo}/commits?path=${encodeURIComponent(
        origin.skillPath
      )}&per_page=1`
    );
    if (commitRes.ok) {
      const commits = await commitRes.json();
      if (Array.isArray(commits) && commits.length > 0) {
        latestSha = commits[0].sha?.slice(0, 7) || latestSha;
        latestDate = commits[0].commit?.committer?.date || latestDate;
      }
    }
  } catch {
    // If commit API is throttled, keep existing SHA or timestamp
  }

  // Clean rawText body for promptInstruction
  const bodyText = rawText.replace(/^---[\s\S]*?---\s*/, '').trim();

  const updatedSkill: NovelSkill = {
    ...skill,
    rawSkillMd: rawText,
    promptInstruction: bodyText || skill.promptInstruction,
    githubRepo: {
      owner: origin.owner,
      repo: origin.repo,
      branch: origin.branch,
      skillPath: origin.skillPath,
      installedCommitSha: latestSha || 'latest',
      installedCommitDate: latestDate,
    },
    latestRemoteUpdate: {
      hasUpdate: false,
      remoteSha: latestSha || 'latest',
      remoteDate: latestDate,
      remoteMessage: '已拉取至最新版本',
      checkedAt: Date.now(),
    },
  };

  await saveGlobalSkill(updatedSkill);
  return {
    updatedSkill,
    summary: `已成功将技能「${skill.name}」更新至 GitHub 最新版本 (${latestSha || '最新'})`,
  };
}
