---
title: "PressDropで、原稿からWordPress入稿をほどく"
excerpt: "Markdownと画像を、推測なしで検査可能な記事データへ変換するサンプルです。"
categories:
  - Workflow
  - WordPress
tags:
  - Markdown
  - Gutenberg
featured_image: images/cover.png
meta:
  desk: technology
  source_label: "PressDrop canonical example"
---
PressDropは、完成した原稿とWordPressのあいだに残る手作業を、明示的なルールで変換します。

## 原稿をまず正規化する

本文の段落と見出しを順番どおりに読み取り、画像も置き場所を推測せず原稿側で指定します。

{{image:images/photo-01.png}}
alt: ノートPCの横に置かれた原稿メモ
caption: 原稿と画像をひとつの入稿セットとして扱う
credit: Photo: PressDrop sample

正規化された記事はJSONとして確認できるため、WordPressへ接続する前に変換結果を検査できます。

### Gutenbergは後段で生成する

正規化モデルから標準ブロックを組み立てることで、Markdown固有の書式をWordPress側へ持ち込みません。

{{image:images/photo-02.png}}
alt: Gutenbergブロックの流れを示す図
caption: 正規化モデルからGutenbergへ一方向に変換する
credit: Illustration: PressDrop sample

このIssueではWordPressへの送信は行わず、ローカルで再現可能な変換だけを完成させます。
