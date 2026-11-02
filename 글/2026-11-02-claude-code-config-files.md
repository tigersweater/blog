---
title: Claude Code 지침·설정 파일 한눈에 정리
date: 2026-11-02 22:00
tags: [Claude Code, 설정]
summary: CLAUDE.md, settings.json, .mcp.json, .env… 책에 나온 여러 파일을 용도별 네 묶음으로 나누고, 공용과 개인(.local)의 차이로 정리했습니다.
---

책에서 Claude Code와 관련된 파일이 여러 개 나왔는데, 이름만 봐서는 무엇이 다른지 헷갈렸습니다. **용도별로 네 묶음**으로 나누니 정리가 됐습니다.

## 한눈에 보기

| 묶음 | 파일 | 한 줄 설명 | 비유 |
|---|---|---|---|
| ① 지침 | `CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules/` | 이렇게 일해라 | 업무 매뉴얼 |
| ② 권한·동작 설정 | `.claude/settings.json`, `.claude/settings.local.json` | 이건 되고, 이건 안 된다 | 출입 권한·결재 규정 |
| ③ 외부 도구 연결 | `.mcp.json`, `~/.claude.json` | 이런 도구와 연결해라 | 거래처 연락처 목록 |
| ④ 비밀값 | `.env`, `.env.local` | 비밀번호·열쇠 보관 | 금고 |

> [!tip] 가장 중요한 규칙
> 이름에 **`.local`**이 붙으면 **"내 PC 전용, GitHub에 올리지 않음"**이라는 뜻입니다.
> `CLAUDE.local.md`, `settings.local.json`, `.env.local` 모두 같은 약속입니다.

## ① 지침: Claude가 읽는 "글"

| 파일 | 내용 | GitHub |
|---|---|---|
| `CLAUDE.md` | 기본 인수인계서. **자동으로 읽힘** | 올림 |
| `CLAUDE.local.md` | 개인 메모 | 안 올림 |
| `.claude/rules/*.md` | 지침을 **주제별 파일로 쪼개 둔 폴더** | 올림 |

- `CLAUDE.md`만 이름이 정해진 특별한 파일입니다. 다른 .md 파일은 `CLAUDE.md` 안에 `@파일이름`을 적어야 함께 읽힙니다.
- `.claude/rules/`는 CLAUDE.md가 길어졌을 때 나눠 담는 곳입니다. 매뉴얼을 "디자인 규칙", "글쓰기 규칙"처럼 장별로 나눈 것과 같고, 파일마다 "이 폴더를 작업할 때만 적용"처럼 범위를 정할 수도 있습니다.

```
.claude/rules/
├─ 디자인.md     ← src 폴더 작업 때만
└─ 글쓰기.md     ← 글 폴더 작업 때만
```

## ② 권한·동작 설정: Claude의 "행동 규칙"

①이 **부탁**이라면 ②는 프로그램이 강제로 지키게 하는 **규정**입니다.

| 파일 | 적용 범위 | GitHub |
|---|---|---|
| `.claude/settings.json` | 이 프로젝트 (팀 공용) | 올림 |
| `.claude/settings.local.json` | 이 프로젝트 (내 PC 전용) | 안 올림 |
| `~/.claude/settings.json` | 이 PC의 **모든 프로젝트** | 해당 없음 |

**담는 내용**
- **권한**: "이 명령은 묻지 말고 실행", "이 폴더는 절대 읽지 마"
- **훅(hooks)**: "파일을 고친 뒤 자동으로 ○○ 실행" 같은 자동 동작
- **환경 변수**

> [!warning] 부탁과 규정의 차이
> 민감한 폴더를 Claude가 읽지 않게 하고 싶을 때, CLAUDE.md에 "읽지 마세요"라고 적는 것은 **부탁**이라 깜빡할 수 있습니다.
> `settings.json`의 권한 거부 규칙으로 막으면 **규정**이라 프로그램이 무조건 막아 줍니다. 꼭 지켜야 하는 것은 settings로!

## ③ 외부 도구 연결 (MCP)

MCP는 Claude를 노션, 슬랙, 구글 시트 같은 **외부 도구와 연결하는 방식**입니다.

| 파일 | 위치 | 내용 |
|---|---|---|
| `.mcp.json` | 프로젝트 폴더 | **이 프로젝트에서** 쓸 외부 도구 목록. GitHub에 올리면 팀원도 같은 도구를 씀 |
| `~/.claude.json` | 내 홈 폴더 | Claude Code의 **전체 상태 파일**: 계정 정보, 모든 프로젝트 공통 MCP, 프로젝트별 기록 |

- 실제 파일 이름은 앞에 점(`.`)이 붙습니다. 점으로 시작하는 파일은 숨김 파일처럼 다뤄집니다.
- `~/.claude.json`은 Claude Code가 스스로 관리하는 파일이라 직접 고칠 일은 거의 없습니다.

## ④ 비밀값: `.env` 파일

Claude 전용이 아니라 **웹·프로그램 개발 전반의 관례**입니다. API 키나 비밀번호처럼 코드에 직접 쓰면 안 되는 값을 따로 보관합니다.

| 파일 | 내용 | GitHub |
|---|---|---|
| `.env` | 기본 설정값 (비밀이 아닌 것) | 경우에 따라 올림 |
| `.env.local` | **진짜 비밀값** (API 키 등) | **절대 안 올림** |

```
# .env.local 예시 (값은 가짜)
API_KEY=abcd1234...
```

> [!danger] 공개 저장소 주의
> API 키가 공개 저장소에 올라가면 몇 분 안에 도용될 수 있습니다. `.env.local`은 반드시 `.gitignore`에 넣어 두세요.

## 이 블로그 프로젝트에서는

| 파일 | 있음? | 이유 |
|---|---|---|
| `CLAUDE.md` | ✅ | 블로그 규칙 (공개) |
| `CLAUDE.local.md` | ✅ | 개인 메모 (GitHub 제외) |
| `.claude/rules/` | ❌ | CLAUDE.md 하나로 충분 |
| `.claude/settings.json` | ❌ | 강제로 막을 것이 아직 없음 |
| `.mcp.json` | ❌ | 연결할 외부 도구 없음 |
| `.env`, `.env.local` | ❌ | 비밀값이 필요 없음 |

## 정리

- [x] **글로 된 지침** → `.md` / **강제 규칙** → `settings.json` / **외부 연결** → `.mcp.json` / **비밀** → `.env`
- [x] **`.local`** = 내 PC 전용, GitHub에 올리지 않음
- [x] 공개 저장소에서는 **개인 정보와 비밀값은 항상 `.local` 쪽에**

관련 글: [[2026-11-02-github-pages-gitignore|GitHub Pages 배포 방식과 .gitignore로 올릴 범위 정하기]]
