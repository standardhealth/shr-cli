# SHR Command-Line Interface (SHR-CLI)

This GitHub repository contains a Node.js command-line interface for parsing CIMPL (Clinical Information Modeling and Profiling Language) definitions and exporting them as a FHIR Implementation Guide, Data Dictionary, JSON serialized files, JSON schema, and/or ES6 classes. Future versions of the CLI may support additional capabilities. 

The CIMPL base class definitions, FHIR mappingss, and a clinical models definitions can be found in the [shr-spec](https://github.com/standardhealth/shr-spec) repo. Documentation on the CIMPL language can be found [here](http://standardhealthrecord.org/cimpl-doc/#cimpl6LanguageReference/).

# Installing SHR-CLI

Before you run SHR-CLI, you must first install its dependencies:

1. Install [Node.js](https://nodejs.org/en/download/) (LTS edition, currently 8.x)
2. Install [Yarn](https://yarnpkg.com/en/docs/install) (1.3.x or above)
3. Execute the following from this project's root directory: `yarn`

The second step is to obtain the SHR-CLI code. This can be done via _git clone_ or by clicking the green "Clone or download" button and choosing "Download Zip" (which you will then need to unzip to a folder of your choosing).

**For complete details on how to install SHR-CLI on Windows and macOS, please see the [CIMPL Setup and Installation Guide](http://standardhealthrecord.org/cimpl-doc/#cimplInstall/).**

# Running SHR-CLI

To create profiles, extensions, and other FHIR assets used in the IG, you run the SHR-CLI tool, as follows:

* Open a command line terminal and navigate to the ~/cimpl/shr-cli directory (where you installed SHR-CLI)
* Run a command similar to this:

    `node . ../exampleDirectory -l error -c ig-example-config.json`

where:

* `node` is the command that starts the SHR-CLI application.
* The first dot `.` represents the path to the SHR-CLI tool, in this case, the current working directory.
* `../exampleDirectory` is the path where your CIMPL modeling and configuration files are located.
* the `-l` parameter and `error` value specifies logging to only show errors.
* the `-c` parameter and `ig-example-config.json` specify your configuration file.

**For details of the command line options and descriptions of auxiliary files and configurations needed to create a FHIR Implementation Guide (IG) from CIMPL (Clinical Information Modeling Profiling Language), please see [CIMPL 6.0 Tooling Reference Guide](http://standardhealthrecord.org/cimpl-doc/#cimpl6ToolingReference/).**

# License

Copyright 2016, 2017, 2018, 2019 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
