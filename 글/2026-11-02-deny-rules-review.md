---
title: 책의 거부 명령어 목록, 윈도우에서 검토하고 적용하기
date: 2026-11-02 23:00
tags: [Claude Code, 설정, 보안]
summary: 책에 나온 Claude Code 거부(deny) 목록을 그대로 쓰면 윈도우에서는 빈틈이 생깁니다. 무엇이 문제였고 어떻게 고쳐 적용했는지 정리했습니다.
---

하네스 엔지니어링을 공부하면서 책에 나온 **거부 명령어 목록**을 내 PC에 적용해 봤습니다. 그대로 쓰지 않고 검토해 보니 고칠 점이 꽤 있었습니다.

> [!note] 거부(deny) 규칙이란?
> `settings.json`에 적어 두면 **Claude Code 프로그램이** 그 명령을 실행 전에 막습니다.
> CLAUDE.md의 "하지 마세요"는 **부탁**, deny는 **규정**입니다.

## 책에 나온 목록

```
rm -rf *
rm -r /*
sudo *
chmod 777 *
curl *
wget *
```

방향은 맞지만 그대로 쓰기에는 세 가지 문제가 있었습니다.

## 문제 1: 적는 형식

실제 `settings.json`에는 **도구 이름(명령)** 형식으로 적어야 합니다.

```json
{
  "permissions": {
    "deny": ["Bash(rm -rf *)", "Bash(curl *)"]
  }
}
```

`Bash(rm -rf *)`는 "`rm -rf `로 **시작하는** 명령은 모두"라는 뜻입니다.

## 문제 2: 책은 맥·리눅스 기준, 내 PC는 윈도우

윈도우의 Claude Code는 **Bash**(Git Bash)와 **PowerShell** 두 가지로 명령을 실행할 수 있습니다. Bash만 막으면 PowerShell로 같은 일을 할 수 있습니다.

| 책의 규칙 | 의도 | 윈도우에서 | 막히지 않던 같은 일 |
|---|---|---|---|
| `rm -rf`, `rm -r /*` | 대량 삭제 | ✅ 필요 | `rm -fr`, `rm -r -f`, `Remove-Item -Recurse` |
| `sudo` | 관리자 권한 | △ 보통 없음 | `Start-Process -Verb RunAs` |
| `chmod 777` | 권한 전부 열기 | △ 거의 효과 없음 | `icacls` |
| `curl`, `wget` | 인터넷 받기·보내기 | ✅ 필요 | `Invoke-WebRequest`, `iwr` |

> [!warning] 글자로 막는 방식의 한계
> 규칙은 **명령의 글자 모양**을 보고 막습니다. `rm -rf`만 막으면 `rm -fr`(순서만 바꾼 같은 명령)은 통과합니다. 그래서 **같은 일을 하는 여러 모양**을 함께 적어야 합니다.

## 문제 3: 다 막으면 불편하다

`curl`은 서버가 켜졌는지 확인하는 등 평소에도 쓰는 명령입니다. 완전히 막는 대신 **매번 묻기(ask)**로 두는 편이 실용적입니다.

| 목록 | 의미 |
|---|---|
| `deny` | 절대 안 됨 |
| `ask` | 쓸 때마다 사용자에게 승인 요청 |
| `allow` | 묻지 않고 실행 |

우선순위는 **deny > ask > allow**입니다.

## 최종 적용한 구성

적용 위치는 **내 PC 전체 설정** `~/.claude/settings.json`입니다. 모든 프로젝트에 적용되고 GitHub에는 올라가지 않습니다.

**거부 (deny)**
- 대량 삭제: `rm -rf`, `rm -fr`, `rm -Rf`, `rm -r`, `rm -R`, `rm --recursive`
- PowerShell 대량 삭제: `Remove-Item … -Recurse`, `rm … -Recurse`, `rmdir /s`
- GitHub 기록 덮어쓰기: `git push --force`, `git push -f`
- 작업 한 번에 날리기: `git reset --hard`

**매번 묻기 (ask)**
- 인터넷: `curl`, `wget`, `Invoke-WebRequest`, `Invoke-RestMethod`, `iwr`, `irm`
- PowerShell 파일 삭제 전체: `Remove-Item` (대량 삭제를 놓쳤을 때의 안전망)

**뺀 것**
- `sudo`, `chmod 777`: 윈도우에서는 효과가 거의 없음

```json
"permissions": {
  "deny": [
    "Bash(rm -rf *)", "Bash(rm -fr *)", "Bash(rm -r *)",
    "PowerShell(Remove-Item *-Recurse*)",
    "Bash(git push --force*)", "Bash(git reset --hard*)"
  ],
  "ask": [
    "Bash(curl *)", "PowerShell(Invoke-WebRequest *)",
    "PowerShell(Remove-Item *)"
  ]
}
```

(일부만 옮겼습니다. Bash와 PowerShell 양쪽에 같은 규칙을 넣었습니다.)

## 정말 막히는지 시험

**없는 폴더**를 지우는 명령으로 시험했습니다. 막히지 않더라도 지워질 것이 없어서 안전합니다.

| 시험 | 결과 |
|---|---|
| Bash `rm -r (없는 폴더)` | ✅ "denied" — 실행 전에 차단 |
| PowerShell `Remove-Item (없는 폴더) -Recurse` | ✅ "denied" — 실행 전에 차단 |

> [!tip] 적용 전 습관
> 1. 기존 설정 파일을 **먼저 백업**
> 2. 기존 내용은 그대로 두고 **추가만**
> 3. 저장 후 JSON 형식이 맞는지 확인 (형식이 틀리면 그 파일 전체가 무시됨)
> 4. **무해한 명령으로** 실제로 막히는지 시험

## 정리

- [x] 책의 목록은 **방향 참고용**, 내 환경(윈도우)에 맞게 고쳐 써야 한다
- [x] **같은 일을 하는 여러 명령 모양**을 함께 막는다 (Bash + PowerShell)
- [x] 자주 쓰는 명령은 deny 대신 **ask**
- [x] 적용 후 **반드시 시험**해 본다

관련 글: [[2026-11-02-claude-code-config-files|Claude Code 지침·설정 파일 한눈에 정리]]
