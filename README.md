# SHR Command-Line Interface

The Standard Health Record (SHR) initiative is working to create a single, high-quality health record for every individual in the United States.  For more information, see [standardhealthrecord.org](http://standardhealthrecord.org/).

This GitHub repository contains a Node.js command-line interface for parsing SHR text definitions and exporting them as FHIR profiles, [CIMCORE](https://github.com/standardhealth/shr-cli/wiki/CIMCORE-Documentation) JSON serialized files, JSON schema, ES6 classes, or a JSON document (for website generation).  Future versions of the CLI may support additional capabilities.

The SHR text definitions and grammar files can be found in the [shr_spec](https://github.com/standardhealth/shr_spec) repo.  As the SHR text format (and content files) are still evolving, so is this toolset.

# Getting the Code

To run the SHR command-line interface, you need to first download the _shr-cli_ code.  This can be done via _git clone_ or by clicking the green "Clone or download" button and choosing "Download Zip" (which you will then need to unzip to a folder of your choosing).

# Setting Up the Environment

To run the command-line interface, you must perform the following steps to install its dependencies:

1. Install [Node.js](https://nodejs.org/en/download/) (LTS edition, currently 8.x)
2. Install [Yarn](https://yarnpkg.com/en/docs/install) (1.3.x or above)
3. Execute the following from this project's root directory: `yarn`

# Exporting SHR to JSON and FHIR

After setting up the environment, you can use node to import a folder of files from CAMEO (SHR text format) and export the definitions to JSON and FHIR:
```
$ node . /path/to/shr_spec/spec
```

The command above will export these formats to the _out_ directory.

It is also possible to override the default logging level or format, skip exports, override the default output folder, or change the configuration file to use:
```
$ node . --help

  Usage: shr-cli <path-to-shr-defs> [options]

  Options:

    -l, --log-level <level>  the console log level <fatal,error,warn,info,debug,trace> (default: info)
    -m, --log-mode <mode>    the console log mode <short,long,json,off> (default: short)
    -s, --skip <feature>     skip an export feature <fhir,json,cimcore,json-schema,es6,model-doc,all> (default: <none>)
    -a, --adl                run the adl exporter (default: false)
    -o, --out <out>          the path to the output folder (default: out)
    -c, --config <config>    the name of the config file (default: config.json)
    -d, --duplicate          show duplicate error messages (default: false)
    -i, --import-cimcore     import CIMCORE files instead of CIMPL (default: false)
    -6, --export-cimpl-6     export CIMPL 6 files generated  from input (default: false)
    -h, --help               output usage information
```

For example:
```
node . ../shr_spec/spec -l error -o out2 -c other_config.json
```

# Advanced Logging

The SHR tools use the [Bunyan](https://www.npmjs.com/package/bunyan) structured logging framework, and store a full log file in the output folder (note: it will be appended to on subsequent runs).  You can use the Bunyan CLI tool to perform advanced filtering of the log file.  For example:
```
node_modules/.bin/bunyan -c 'this.shrId=="shr.vital.BloodPressure"'  -o short out/out.log
```
(On Windows, replace `/` with `\` in the example).

For more information on Bunyan and Bunyan CLI, see the Bunyan documentation.

# Creating the FHIR Implementation Guide

After exporting the SHR definitions, the FHIR Implementation Guide (IG) Publisher tool can be used to create a FHIR implementation guide, containing HTML documentation, bundled definitions, and more.  This requires that the Java Runtime Environment (JRE) 8/9 or Java SDK (JSDK) are installed on your system.  It also requires Jekyll ([Mac/Linux](https://jekyllrb.com/) / [Windows](http://jekyll-windows.juthilo.com/1-ruby-and-devkit/)). After ensuring they are installed, run the following command:
```
$ yarn run ig:publish
```

NOTE: The FHIR IG publishing tool uses a _lot_ of memory when processing the full set of SHR definitions.  The yarn script above will allocated up to 8GB of RAM. A minimum of 4GB of RAM is recommended to run the tool.

# Creating the FHIR Implementation Guide Using an HTTP Proxy

If your system requires a proxy to access the internet, you'll need to take a more complex approach than above.

First, export a system environment variable called JAVA_OPTS, setting the proxies as appropriate.

On Mac or Linux:
```
$ export JAVA_OPTS="-Dhttp.proxyHost=my.proxy.org -Dhttp.proxyPort=80 -Dhttps.proxyHost=my.proxy.org -Dhttps.proxyPort=80 -DsocksProxyHost=my.proxy.org -DsocksProxyPort=80"
```

On Windows:
```
> SET JAVA_OPTS=-Dhttp.proxyHost=my.proxy.org -Dhttp.proxyPort=80 -Dhttps.proxyHost=my.proxy.org -Dhttps.proxyPort=80 -DsocksProxyHost=my.proxy.org -DsocksProxyPort=80
```

Next, create the IG using the HL7 IG Publisher Tool.

On Mac or Linux:
```
$ java $JAVA_OPTS -Xms4g -Xmx8g -jar out/fhir/guide/org.hl7.fhir.igpublisher.jar -ig out/fhir/guide/ig.json
```

On Windows:
```
> java %JAVA_OPTS% -Xms4g -Xmx8g -jar out/fhir/guide/org.hl7.fhir.igpublisher.jar -ig out/fhir/guide/ig.json
```

# Configuration File
When using this command-line interface and IG publisher, the general order of operations is as follows:

1. The command-line interface (CLI) imports SHR definitions that have been written (as in the [shr_spec](https://github.com/standardhealth/shr_spec) repo) and parses them through a text importer.
2. CLI applies filters, according to the `filterStrategy` (see below).
3. CLI exports the filtered SHR definitions into desired formats, such as ES6, JSON, FHIR, etc. The exports can be selected through command line options, as explained above.
4. (separate, optional step) The IG publisher takes the SHR FHIR export and generates an IG from the information in these files, following the `implementationGuide` configuration (see below).

To control this process, CLI requires a configuration file. Configuration files *must* be valid JSON, have at least the `projectName` property, and use the `.json` file extension. The configuration file must be located in the path to the SHR specification definitions.

If a configuration file name is specified using the `-c` command line option, the SHR tools look for a file with this name in the specification definitions directory. If it cannot be found or it is an invalid configuration file, an error is returned. If no configuration file is specified at startup, the SHR tools look for a file called `config.json` in this directory. If it is not found, a default `config.json` file is auto-generated and used.

The contents of the configuration file are as follows:

|Parameter            |Type    |Description                                                    |
|:--------------------|:-------|:--------------------------------------------------------------|
|`projectName`        |`string`|The name of the project.                                       |
|`projectShorthand`   |`string`|A shorthand name for the project.                              |
|`projectURL`         |`string`|The primary URL for the project.                               |
|`fhirURL`            |`string`|The FHIR IG URL for the project.                               |
|`fhirTarget`         |`string`|The FHIR target for the project (`FHIR_STU_3` or `FHIR_DSTU_2`)|
|`entryTypeURL`       |`string`|The root URL for the JSON schema `EntryType` field.            |
|`filterStrategy`     |`{}`    |An object containing configuration for filtering.              |
|`contentProfile`     |`string`|The base file name for the content profile for the project.    |
|`implementationGuide`|`{}`    |An object containing configuration for IG publishing.          |
|`publisher`          |`string`|The name of the publisher for the project.                     |
|`contact`            |`[]`    |The array of FHIR `ContactPoint`s to reach about the project.  |

## Project Name and Publisher

* `projectName`
* `projectShorthand`
* `publisher`
* `contact`

## Project URLs and FHIR Target

* `projectURL`
* `fhirURL`
* `fhirTarget`
* `entryTypeURL`

## Filter Configuration
Between import (step 1) and export (step 3), there is an opportunity to remove unwanted elements to limit the scope of the exports, and subsequently, the IG. If only a subset of the SHR definitions are desired, filtering down to target elements or namespaces causes only those targets (and their dependencies) to be exported, ignoring the rest.

The contents of the `filterStrategy` object are as follows:

|Parameter |Type     |Description                                                                          |
|:---------|:--------|:------------------------------------------------------------------------------------|
|`filter`  |`boolean`|A value indicating whether to enable filtering.                                      |
|`strategy`|`string` |The strategy for specification filtering (`"namespace"`, `"element"`, or `"hybrid"`).|
|`target`  |`[]`     |An array of strings containing the names for what to filter.                         |

* The `"element"` `strategy` will filter the specifications to include each `EntryElement` listed in the `target` array and their recursive dependencies (other `EntryElement`, `Element`, and `ValueSet` definitions referenced by the selected `EntryElements`).
* The `"namespace"` `strategy` will filter the specifications to include each `EntryElement` in the namespaces listed in the `target` array and their recursive dependencies.
* The `"hybrid"` `strategy` will filter the specifications to include each `EntryElement` listed in the `target` array and all `EntryElements` in every namespace listed in the `target` array, and their recursive dependencies.
* If `filter` is `true`, then the filtering operation will occur. Otherwise, no filtering will occur.
* If there is no `filterStrategy` or `strategy`, filtering will not occur.

When specifying a namespace or element in the `target` array, it is best to use the fully qualified name (FQN) format for doing so. For example, a namespace could be `"shr.oncology"` and an element could be `"shr.oncology.BreastCancerStage"`.

## Implementation Guide Configuration
These configurations are used to highlight specific elements as more important in the IG. This is where the `implementationGuide` configuration comes into play.

The contents of the `implementationGuide` object are as follows:

|Parameter                 |Type     |Description                                                    |
|:-------------------------|:--------|:--------------------------------------------------------------|
|`npmName`                 |`string` |The assigned npm-name (see note) for this IG,                  |
|`version`                 |`string` |The version of this IG (not necessarily the version of FHIR).  |
|`includeLogicalModels`    |`boolean`|A value indicating whether to include logical models in the IG.|
|`includeModelDoc`         |`boolean`|A value indicating whether to include the model doc in the IG. |
|`indexContent`            |`string` |The name of the file or folder to place the IG index content.  |
|`primarySelectionStrategy`|`{}`     |The strategy for selection of what is primary in the IG.       |

Note: the npm-name is _______________________

The contents of the `primarySelectionStrategy` object are as follows:

|Parameter |Type    |Description                                                                                                 |
|:---------|:-------|:-----------------------------------------------------------------------------------------------------------|
|`strategy`|`string`|The strategy to follow for primary selection (`"namespace"`, `"hybrid"`, or default `"entry"`).             |
|`primary` |`[]    `|An array containing the namespaces and entries (only used for `"namespace"` and `"hybrid"` `strategy`).     |

The primary selection strategy causes certain profiles to be listed in a "Primary" section at the top of their respective pages in the IG, displaying them as most directly relevant. All other profiles exported in step 3 are listed in a "Supporting" section below the "Primary" section.

The options for the configuration file's `implementationGuide.primarySelectionStrategy` are described below.

* The `"entry"` `strategy` selects every profile in the filtered set as primary in the IG.
* The `"namespace"` `strategy` selects every profile found in the namespaces of the `primary` array as primary in the IG.
* The `"hybrid"` `strategy` for primary selection sets every entry listed in the `primary` array or found in the namespaces in the `primary` array as primary in the IG.
* If there is no `strategy` set in the `implementationGuide.primarySelectionStrategy`, the default operation is the `"entry"` `strategy`.

When specifying a namespace or element in the `primary` array, it is best to use the fully qualified name (FQN) format for doing so. For example, a namespace could be `"shr.oncology"` and an element could be `"shr.oncology.BreastCancerStage"`.

## Content Profile

The content profile allows authors to indicate the fields and paths that should be marked as "Must Support".  Future versions of content profiles will allow for additional features.

The following demonstrates the correct format for a content profile file:
```
Grammar: ContentProfile 1.0

Namespace: shr.core
    Patient:
        Person.DateOfBirth MS
        Person.AdministrativeGender MS
        Person.Race MS
        Person.Ethnicity MS
        Person.Address.PostalCode MS
        Person.Deceased MS
    ComorbidCondition:
        PatientSubjectOfRecord MS
        Code MS
        ClinicalStatus MS
    // ... more ...

Namespace: oncocore
    CancerCondition:
        PatientSubjectOfRecord MS
        Code MS
        ClinicalStatus MS
        BodyLocation.LocationCode MS
        MorphologyBehavior MS
        DateOfDiagnosis MS
    // ... more ...
```

# License

Copyright 2016, 2017 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
