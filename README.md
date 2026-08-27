# importants-blog-site

혜택노트 — 정부 지원금·복지·세금환급 정보 블로그. https://blog.importants-studio.com

Hugo + PaperMod 테마. 파이프라인 설계 문서는 로컬 `~/Desktop/blog-automation/` 참고.

## 로컬 실행

```bash
git clone --recurse-submodules https://github.com/importantsgit/importants-blog-site.git
hugo server -D   # http://localhost:1313
```

## 글 추가

```bash
hugo new content/posts/YYYY-MM-DD-slug.md
```

frontmatter의 `sourceUrl`에 근거가 된 정부 보도자료/공고 원문 링크를 기록한다. `draft: false`로 바꿔야 발행된다.

## Cloudflare Pages 설정

- Build command: `hugo --gc --minify`
- Build output directory: `public`
- 환경 변수: `HUGO_VERSION=0.165.0`
- Custom domain: `blog.importants-studio.com`
