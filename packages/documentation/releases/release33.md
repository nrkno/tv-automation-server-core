---
sidebar_label: v1.33 (Unreleased)
sidebar_position: 1000
title: Release 33
---

Not released yet, target version: 1.33

### Main Features

- Support of inputting basic arrays in settings
- Filter out duplicate ad libs
- Human readable layer names for use in UI's
- Blueprints can now upload static assets to core to be used as icons and previews in the UI'
  - Note that this introduces a breaking change in the blueprint ingest API
- Translatable adlib actions
- Various other Blueprint API improvements
- Introduction of expected playout items
- Staggered UI updates improving UI performance
- Playout gateway can upload short clips to Blackmagic Atem Switchers

### Components

| Component                                                                                                                                                                                                                                                                                                                                                                                                         | Version |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------ |
| [Core](https://github.com/nrkno/tv-automation-server-core) <br/> [Blueprints API ( Core )](https://www.npmjs.com/package/@sofie-automation/blueprints-integration)<br/>[Gateway API](https://www.npmjs.com/package/@sofie-automation/server-core-integration)<br/>[Mos Gateway](https://github.com/nrkno/tv-automation-mos-gateway)<br/>[Playout Gateway](https://github.com/nrkno/tv-automation-playout-gateway) | 1.33    |
| [Blueprints API ( TSR )](https://www.npmjs.com/package/timeline-state-resolver)                                                                                                                                                                                                                                                                                                                                   | 5.8     |
| [Media Manager](https://github.com/nrkno/tv-automation-media-management)                                                                                                                                                                                                                                                                                                                                          | 1.8     |

<!-- <table>
  <thead>
    <tr>
      <th style="text-align:left">Component</th>
      <th style="text-align:left">Version</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:left">
        <p><a href="https://github.com/nrkno/tv-automation-server-core">Core</a>
        </p>
        <p><a href="https://www.npmjs.com/package/@sofie-automation/blueprints-integration">Blueprints API ( Core )</a>
        </p>
        <p><a href="https://www.npmjs.com/package/@sofie-automation/server-core-integration">Gateway API</a>
        </p>
      </td>
      <td style="text-align:left">1.33</td>
    </tr>
    <tr>
      <td style="text-align:left"><a href="https://www.npmjs.com/package/timeline-state-resolver">Blueprints API ( TSR )</a>
      </td>
      <td style="text-align:left">5.8</td>
    </tr>
    <tr>
      <td style="text-align:left"><a href="https://github.com/nrkno/tv-automation-playout-gateway">Playout Gateway</a>
      </td>
      <td style="text-align:left">1.33</td>
    </tr>
    <tr>
      <td style="text-align:left"><a href="https://github.com/nrkno/tv-automation-mos-gateway">Mos Gateway</a>
      </td>
      <td style="text-align:left">1.33</td>
    </tr>
    <tr>
      <td style="text-align:left"><a href="https://github.com/nrkno/tv-automation-media-management">Media Manager</a>
      </td>
      <td style="text-align:left">1.8</td>
    </tr>
  </tbody>
</table> -->
