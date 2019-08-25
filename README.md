# SHR Command-Line Interface (SHR-CLI)

This GitHub repository contains a Node.js command-line interface for parsing CIMPL (Clinical Information Modeling and Profiling Language) definitions and exporting them as a FHIR Implementation Guide, Data Dictionary, JSON serialized files, JSON schema, and/or ES6 classes. Future versions of the CLI may support additional capabilities. 

The CIMPL base class definitions, FHIR mappingss, and a clinical models definitions can be found in the [shr-spec](https://github.com/standardhealth/shr-spec) repo. Documentation on the CIMPL language can be found [here](http://standardhealthrecord.org/cimpl-doc/#cimpl6LanguageReference/).

# Installing SHR-CLI

**For complete details on how to install SHR-CLI on Windows and macOS, please see the [CIMPL Setup and Installation Guide](http://standardhealthrecord.org/cimpl-doc/#cimplInstall/).**

The first step is to obtain the SHR-CLI code. This can be done via _git clone_ or by clicking the green "Clone or download" button and choosing "Download Zip" (which you will then need to unzip to a folder of your choosing).

Before you run SHR-CLI, you must first install its dependencies:

1. Install [Node.js](https://nodejs.org/en/download/) (LTS edition, currently 8.x)
2. Install [Yarn](https://yarnpkg.com/en/docs/install) (1.3.x or above)
3. Execute the following from this project's root directory: `yarn`

## Running SHR-CLI

**Please see our [comprehensive guide to the SHR-CLI](http://standardhealthrecord.org/cimpl-doc/#cimpl6ToolingReference/), including descriptions of auxiliary files and configurations needed to create a FHIR Implementation Guide (IG) from CIMPL (Clinical Information Modeling Profiling Language).**





# Advanced Logging

The SHR tools use the [Bunyan](https://www.npmjs.com/package/bunyan) structured logging framework, and store a full log file in the output folder (note: it will be appended to on subsequent runs).  You can use the Bunyan CLI tool to perform advanced filtering of the log file.  For example:
```
node_modules/.bin/bunyan -c 'this.shrId=="shr.vital.BloodPressure"'  -o short out/out.log
```
(On Windows, replace `/` with `\` in the example).

For more information on Bunyan and Bunyan CLI, see the Bunyan documentation.


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
