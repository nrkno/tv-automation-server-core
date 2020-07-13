# Sofie: The Modern TV News Studio Automation System (tv-automation-server-core)

This is the core application of the [**Sofie** TV News Studio Automation System](https://github.com/nrkno/Sofie-TV-automation/).


## Local development
First, install Meteor:

* [Meteor Installation Guide](https://www.meteor.com/install)

Then, clone the repository and install all dependencies:
(Make sure your NODE_ENV is NOT set to production!)

```
git clone -b master https://github.com/nrkno/tv-automation-server-core.git
cd tv-automation-server-core/meteor
meteor npm install
meteor
```

If you run into any issues while installing the dependencies, clone any offending packages from Git and link them using `npm link`. For example, for `tv-automation-mos-connection` library:

```
git clone -b master https://github.com/nrkno/tv-automation-mos-connection.git
cd tv-automation-mos-connection
npm run build
npm link
cd ../tv-automation-server-core/meteor
npm link mos-connection
```

### Code formatting
This repository has recently been reformatted using prettier. If you have an existing branch taken before that happened [head here](https://github.com/nrkno/tv-automation-server-core/issues/240) for instructions on how to avoid large merge conflicts.

## System settings

In order for the system to work properly, it may be neccessary to set up several system properties. These can be set through environement variables - if not present, default values will be used.

| Setting       | Use                                                        | Default value       |
| ------------- | ---------------------------------------------------------- | ------------------- |
| `NTP_SERVERS` | Comma separated list of time servers to sync the system to | `0.se.pool.ntp.org` |

## User Interface settings

When running meteor it is possible to provide it with [additional settings](https://docs.meteor.com/api/core.html#Meteor-settings). The User Interface allows specyfing the following Settings in the `public` key and will use default values if not present.

| Setting                        | Use                                                                                    | Default value |
| ------------------------------ | -------------------------------------------------------------------------------------- | ------------- |
| `frameRate`                    | Frames per second base for displaying timecodes in the UI                              | 25            |
| `defaultToCollapsedSegments`   | All segments be collapsed by default                                                   | `false`       |
| `autoRewindLeavingSegment`     | Should the segment in the Rundown view automatically rewind after it stops being live? | `false`       |
| `autoExpandCurrentNextSegment` | Should the Current and Next segments be automatically made expanded (uncollapsed)      | `false`       |

## Additional views

For the purpose of running the system in a studio environment, there are additional endpoints, unavailable from the menu structure.

| Path                              | Function                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| `/countdowns/:studioId/presenter` | Countdown clocks for a given studio, to be shown to the studio presenter |
| `/activeRundown/:studioId`        | Redirects to the rundown currently active in a given studio              |
| `/activeRundown/:studioId/shelf`  | Shows a Detached Shelf for the current active rundown in a studio        |
| `/rundown/:rundownId/shelf`       | Shows a Detached Shelf for the rundown                                   |
| `/prompter/:studioId`             | A simple prompter for the studio presenter                               |

## Studio mode

In general, you will want to limit the amount of client stations that have full control of the studio (such as activating rundowns, taking parts, ad-libbing, etc.). In order to mark a given client station (browser) as a Studio Control station, you should append `?studio=1` to any query string, for example:

```http://localhost:3000/?studio=1```

This setting is persisted in browser's Local Storage. To disable studio mode in a given client, append `?studio=0`.

## Configuration mode

In the default mode, the Settings page will be unavailable from main navigation. If you want access to the Settings page on a given client station, append `?configure=1` to any query string.

```http://localhost:3000/?configure=1```

## Developer mode

In developer mode, right click is not disabled

```http://localhost:3000/?develop=1```

## Language selection

The UI will automatically detect user browser's default matching and select the best match, falling back to english. You can also force the UI language to any language by navigating to a page with `?lng=xx` query string, for example:

```http://localhost:3000/?lng=xx```

This choice is persisted in browser's Local Storage, and the same language will be used until a new forced language is chosen using this method.

## Rundown view & Detached Shelf view layouts

The Rundown view and the Detached Shelf view UI can have multiple concurrent layouts for any given Show Style. The automatic selection mechanism works as follows:

1. select the first layout of the RUNDOWN_LAYOUT type, 
2. select the first layout of any type, 
3. use the default layout (no additional filters), in the style of RUNDOWN_LAYOUT.

To use a specific layout in these views, you can use the `?layout=...` query string, providing either the ID of the layout or a part of the name. This string will then be mached against all available layouts for the Show Style, and the first matching will be selected. For example, for a layout called `Stream Deck layout`, to open the currently active rundown's Detached Shelf use:

```http://localhost:3000/activeRundown/studio0/shelf?layout=Stream```

The Detached Shelf view with a custom DASHBOARD_LAYOUT allows displaying the Shelf on an auxiliary touch screen, tablet or a Stream Deck device. A specialized Stream Deck view will be used if the view is opened on a device with hardware characteristics matching a Stream Deck device.

The shelf also contains additional elements, not controlled by the Rundown View Layout. These include Buckets and the Inspector. If needed, these
components can be displayed or hidden using additional url arguments:

| Query parameter                     | Description                                                             |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Default                             | Display the rundown layout (as selected), all buckets and the inspector |
| `?display=layout,buckets,inspector` | A comma-separated list of features to be displayed in the shelf         |
| `?buckets=0,1,...`                  | A comma-separated list of buckets to be displayed                       |

* `display`: Available values are: `layout` (for displaying the Rundown Layout), `buckets` (for displaying the Buckets) and `inspector` (for displaying the Inspector).
* `buckets`: The buckets can be specified as base-0 indices of the buckets as seen by the user. This means that `?buckets=1` will display the second bucket as seen by the user when not filtering the buckets. This allows the user to decide which bucket is displayed on a secondary attached screen simply by reordering the buckets on their main view.

*Note: the Inspector is limited in scope to a particular browser window/screen, so do not expect the contents of the inspector to sync across multiple screens.*

## Operating the prompter screen

The prompter can be controlled by different types of controllers. Which mode is set by the query parameter, like so: `?mode=mouse`.

| Query parameter         | Description                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Default                 | Controlled by both mouse and keyboard                                                      |
| `?mode=mouse`           | Controlled by mouse only                                                                   |
| `?mode=keyboard`        | Controlled by keyboard only                                                                |
| `?mode=shuttlekeyboard` | Controlled by a Contour-ShuttleXpress or X-keys, configured as keyboard-inputs (see below) |

### Customize looks

The prompter UI can be configured using query parameters:

| Query parameter | Type   | Description                                                                                     | Default |
| --------------- | ------ | ----------------------------------------------------------------------------------------------- | ------- |
| `mirror`        | string | Mirror the display horisontally                                                                 |         |
| `vmirror`       | string | Mirror the display vertically                                                                   |         |
| `fontsize`      | number | Set a custom font size of the text. 20 will fit in 5 lines of text, 14 will fit 7 lines etc..   | 14      |
| `marker`        | string | Set position of the read-marker. Possible values: "center", "top", "bottom", "hide"             | "hide"  |
| `margin`        | number | Set margin of screen (used on monitors with overscan), in %.                                    | 0       |
| `showmarker`    | 0 / 1  | If the marker is not set to "hide", control if the marker is hidden or not                      | 1       |
| `showscroll`    | 0 / 1  | Whether the scroll bar should be shown                                                          | 1       |
| `followtake`    | 0 / 1  | Whether the prompter should automatically scroll to current segment when the operator TAKE:s it | 1       |

Example: http://mySofie/prompter/studio0/?mode=mouse&followTake=0&fontsize=20

### Control using mouse (scroll wheel)

The prompter can be controlled in multiple ways when using the scroll wheel:

| Query parameter             | Description                                                                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?controlmode=normal`       | Scrolling of the mouse works as "normal scrolling"                                                                                                                                       |
| `?controlmode=speed`        | Scrolling of the mouse changes the speed of scolling. Left-click to toggle, right-click to rewind                                                                                        |
| `?controlmode=smoothscroll` | Scrolling the mouse wheel starts continous scrolling. Small speed adjustments can then be made by nudging the scroll wheel. Stop the scrolling by making a "larger scroll" on the wheel. |

has several operating modes, described further below.
All modes are intended to be controlled by a computer mouse or similar, such as a presenter tool.

### Control using keyboard

Keyboard control is intended to be used when having a "keyboard"-device, such as a presenter tool.

| Scroll up  | Scroll down |
| ---------- | ----------- |
| Arrow Up   | Arrow Down  |
| Arrow Left | Arrow Right |
| Page Up    | Page Down   |
|            | Space       |

### Control using Contour ShuttleXpress or X-keys

This mode is intended to be used when having a Contour ShuttleXpress or X-keys device, configured to work as a keyboard device.

Config-files to be used in respective config software:

* [Contour ShuttleXpress](resources/prompter_layout_shuttlexpress.pref)
* [X-keys](resources/prompter_layout_xkeys.mw3)

# For developers

## Translating Sofie

For support of various languages in the User Interface, Sofie uses the i18next framework. It uses JSON-based translation files to store UI strings. In order to build a new translation file, first extract a PO template file from Sofie UI source code:

```
cd meteor
npm run i18n-extract-pot
```

Find the created `template.pot` file in `meteor/i18n` folder. Create a new PO file based on that template using a PO editor of your choice. Save it in the `meteor/i18n` folder using your [ISO 639-1 language code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) of choice as the filename.

Next, modify the `package.json` scripts and create a new language compilations script:

```
"i18n-compile-json": "npm run i18n-compile-json-nb & npm run i18n-compile-json-sv & npm run i18n-compile-json-xx",
"i18n-compile-json-xx": "i18next-conv -l nb -s i18n/xx.po -t public/locales/xx/translations.json",
```

Then, run the compilation script:

```npm run i18n-compile-json```

The resulting JSON file will be placed in `meteor/public/locales/xx`, where it will be available to the Sofie UI for use and autodetection.

## Additional information

Background image used for previewing graphical elements is based on "Sunset over dark forest" by Aliis Sinisalu: https://unsplash.com/photos/8NiAH5YRZPs used under the [Unsplash License](https://unsplash.com/license).

---

*The NRK logo is a registered trademark of Norsk rikskringkasting AS. The license does not grant any right to use, in any way, any trademarks, service marks or logos of Norsk rikskringkasting AS.*

