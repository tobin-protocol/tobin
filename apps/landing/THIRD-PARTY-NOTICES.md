# Third-party notices (landing page)

This lists the open-source packages that this branch added to `apps/landing` (directly or as transitive
dependencies of the chart, icon and image libraries), with each package's version, declared licence and the
copyright line from its own licence file. It was generated from `node_modules` with
the packages' own metadata. It is a record of what the packages say about themselves; it is **not** legal
clearance, and `ci/dependency-baseline.csv` passing is not either. The repository's release gate G04
(dependency and attribution review) is still BLOCKED for versioned releases.

The fonts, photographs, video and illustrations are covered in [NOTICE](NOTICE) and [ASSET-CREDITS.md](ASSET-CREDITS.md).

## Added direct dependencies

| Package | Version | Declared licence | Copyright line from the package's licence file |
| --- | --- | --- | --- |
| `@hugeicons/react` | 1.1.10 | MIT | Copyright (c) 2025 Hugeicons |
| `@hugeicons/core-free-icons` | 4.4.0 | MIT | Copyright (c) 2025 Hugeicons |
| `@web3icons/react` | 4.1.24 | MIT | no licence file in the package; licence is declared only in package.json |
| `recharts` | 3.10.1 | MIT | Copyright (c) 2015-present recharts |
| `sharp` | 0.35.5 | Apache-2.0 | (the file is the standard Apache-2.0 text; it names no copyright holder) |

`sharp` is used only by `scripts/build-brand-icons.mjs` at development time and is not shipped to browsers; Next.js also lists it as an optional dependency of its own.

## Added transitive dependencies

| Package | Version | Declared licence | Copyright line from the package's licence file |
| --- | --- | --- | --- |
| `@reduxjs/toolkit` | 2.13.0 | MIT | Copyright (c) 2018 Mark Erikson |
| `@standard-schema/spec` | 1.1.0 | MIT | Copyright (c) 2024 Colin McDonnell |
| `@standard-schema/utils` | 0.3.0 | MIT | Copyright (c) 2024 Fabian Hiller |
| `@web3icons/common` | 0.11.53 | MIT | no licence file in the package; licence is declared only in package.json |
| `clsx` | 2.1.1 | MIT | Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com) |
| `csstype` | 3.2.3 | MIT | Copyright (c) 2017-2018 Fredrik Nicol |
| `d3-array` | 3.2.4 | ISC | Copyright 2010-2023 Mike Bostock |
| `d3-color` | 3.1.0 | ISC | Copyright 2010-2022 Mike Bostock |
| `d3-ease` | 3.0.1 | BSD-3-Clause | Copyright 2010-2021 Mike Bostock |
| `d3-format` | 3.1.2 | ISC | Copyright 2010-2026 Mike Bostock |
| `d3-interpolate` | 3.0.1 | ISC | Copyright 2010-2021 Mike Bostock |
| `d3-path` | 3.1.0 | ISC | Copyright 2015-2022 Mike Bostock |
| `d3-scale` | 4.0.2 | ISC | Copyright 2010-2021 Mike Bostock |
| `d3-shape` | 3.2.0 | ISC | Copyright 2010-2022 Mike Bostock |
| `d3-time-format` | 4.1.0 | ISC | Copyright 2010-2021 Mike Bostock |
| `d3-time` | 3.1.0 | ISC | Copyright 2010-2022 Mike Bostock |
| `d3-timer` | 3.0.1 | ISC | Copyright 2010-2021 Mike Bostock |
| `decimal.js-light` | 2.5.1 | MIT | Copyright (c) 2020 Michael Mclaughlin |
| `es-toolkit` | 1.53.0 | MIT | Copyright (c) 2024 Viva Republica, Inc. |
| `eventemitter3` | 5.0.4 | MIT | Copyright (c) 2014 Arnout Kazemier |
| `immer` | 11.2.9 | MIT | Copyright (c) 2017 Michel Weststrate |
| `internmap` | 2.0.3 | ISC | Copyright 2021 Mike Bostock |
| `react-is` | 16.13.1 | MIT | Copyright (c) Facebook, Inc. and its affiliates. |
| `react-redux` | 9.3.1 | MIT | Copyright (c) 2015-present Dan Abramov |
| `redux-thunk` | 3.1.0 | MIT | Copyright (c) 2015-present Dan Abramov |
| `redux` | 5.0.1 | MIT | Copyright (c) 2015-present Dan Abramov |
| `reselect` | 5.2.0 | MIT | Copyright (c) 2015-2018 Reselect Contributors |
| `tiny-invariant` | 1.3.3 | MIT | Copyright (c) 2019 Alexander Reardon |
| `use-sync-external-store` | 1.7.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `victory-vendor` | 37.4.1 | MIT AND ISC AND BSD-3-Clause | Copyright (c) 2015-2026 Nearform. |

Also added: 11 `@types/*` packages (MIT, type declarations only, not shipped) and the platform-specific `@img/sharp-*` binaries that `sharp` selects (for example `@img/sharp-win32-x64` declares Apache-2.0 AND LGPL-3.0-or-later in its package metadata; development-time only).

## Things to know

- **`@web3icons/react` and `@web3icons/common`** ship no licence file in the package; MIT is declared only in `package.json`. The icons are the marks of the networks they depict (the page uses the Stellar network mark). The MIT declaration does not by itself grant any trademark rights in those marks; confirm the Stellar Development Foundation's brand terms if the mark is kept.
- **`victory-vendor`** bundles several third-party libraries and declares `MIT AND ISC AND BSD-3-Clause`.
- Hugeicons' `@hugeicons/react` and `@hugeicons/core-free-icons` carry MIT licence files (Copyright (c) 2025 Hugeicons).

## Licence texts

The MIT, ISC and BSD-3-Clause texts below are copied from the first package in the list above that carries each one. Each package's own copyright line is in its table row.

### MIT

```text
MIT License

Copyright (c) 2025 Hugeicons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### ISC

```text
Copyright 2010-2023 Mike Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

### BSD-3-Clause

```text
Copyright 2010-2021 Mike Bostock
Copyright 2001 Robert Penner
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the author nor the names of contributors may be used to
  endorse or promote products derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
