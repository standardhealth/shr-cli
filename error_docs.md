# Common Error Codes

| Number        | Message       | Solution |
| ------------  | ------------- | -------- |
| 1113          | Failed to resolve definition for `$ELEMENT_NAME`  | The referenced Element doesn't exist in the current namespace, or in any of its inherited parents. Check spelling errors as well as imports. |
| 1341          | Unable to establish namespace for `$ELEMENT_NAME`  | Double check imports and element name spelling. |
| 0201          | WARN shr: Potentially mismatched targets. Based on class (shr.core.Duration) maps to Duration. |
| 0304          | Element profiled on Basic. Consider a more specific mapping. | The Basic profile should not be used in most cases. Consider a more specific profile mapping that categorizes the Element being mapped.
| 1115          | token recognition error at: `$CHARACTER` | This is usually a typo issue. Investigate keywords and missing colons around the specificed text input.
| 1116          | mismatched input `$INPUT` expecting `$LIST_OF_KEYWORDS` | This is usually a typo issue. Investigate spelling and keywords used around the specificied text input.
| 1123          | extraneous input `$INPUT` expecting `$LIST_OF_KEYWORDS` | This is usually a typo issue. Investigate spelling and keywords used around the specificied text input.
| 1204          | No cardinality found for field: `$FIELD`                           | Explicity define cardinality for that field. |
| 1210          | Cannot constrain cardinality of `$NAME` from `$SMALL_CARDINALITY` to `$BIGGER_CARDINALITY`              | You can only narrow the cardinality. You cannot constrain it to have a larger range than its parent |
| 1205          | Cannot override `$OLD_VALUE` with `$NEW_VALUE`                     | Double check types match. |
| 1201          | Cannot resolve element definition.                                 | Element doesn't exist. Double check spelling and inheritance |
| 1101          | Element name '`$NAME`' should begin with a capital letter          | Rename the specified Element |
| 0305          | No mapping to '`$ELEMENT PATH`'. This property is core to the target resource and usually should be mapped.
| 1322          | Mismatched types. Cannot map `$SOURCE_VALUE` to `$MAPPING`. |

# All Warning Codes

| Warning Code | Warning Message | Solution |
| ------------ | --------------- | -------- |
| 0101 | No project configuration file found, currently using default EXAMPLE identifiers. Auto-generating a proper 'config.json' in your specifications folder | Open the 'config.json' file and customize it for your project.
| 0102 | Config file missing key: `$KEY`, using default key: `$DEFAULT VALUE` instead.   | Open the 'config.json' file and add your project specific details for that key.
| 0201 | Potentially mismatched targets. Based on class `($CLASS)` maps to `$MAPPINGS`.  | You're overwriting an inherited mapping. This is not necessarily an issue, but is definitely something to be cautious of. |
| 0301 | Trying to map `$PROFILE` to `$CODE`, but `$PROFILE` was previously mapped to it | 
| 0302 | Choice has equivalent types, so choice options may overwrite or override each other when mapped to FHIR. |
| 0303 | Overriding extensible value set constraint from `$VS` to `$VS`.  Only allowed when new codes do not overlap meaning of old codes. |
| 0304 | Element profiled on Basic. Consider a more specific mapping. | The Basic profile should not be used in most cases. Consider a more specific profile mapping that categorizes the Element being mapped. |
| 0305 | No mapping to '`$ELEMENT PATH`'. This property is core to the target resource and usually should be mapped. |  
| 0306 | The `$PROPERTY` property is not bound to a value set, fixed to a code, or fixed to a quantity unit. This property is core to the target resource and usually should be constrained |
| 0401 | Unsupported code system: '`$CODESYSTEM`' | 

# All Error Codes

| Error Code    | Error Message | Solution |
| ------------  | ------------- | -------- |
| 1101          | Element name '`$NAME`' should begin with a capital letter          | Rename the specified Element |
| 1102          | Entry Element name '`$NAME`' should begin with a capital letter    | Rename the specified EntryElement |
| 1103          | Unable to resolve value set reference: `$VALUESET`                 | Invalid value set reference, double check the name and the path
| 1104          | Unsupported binding strength: `$BINDING_STRENGTH`.  Defaulting to REQUIRED     | Binding strength has to be one of the following:<br>-"must be" (required)<br> -"must be X if covered" (extensible)<br> -"should be" (preferred) <br> -"could be" (optional) |
| 1105          | Error parsing source path: `$PATH`                                 | Invalid path to definitions. Double check path. |
| 1106          | Invalid config file. Should be valid JSON dictionary               | Make sure your 'config.json' file is using a valid format for JSON. |
| 1107          | Unsupported grammar version: `$VERSION`                            | Grammar Version for file must be 5.0 (or above) |
| 1108          | Defining value sets by URL has been deprecated in ValueSet files.  ValueSet `$VALUESET` ignored.           | Define the value set with a name using proper syntax. |
| 1109          | Defining value sets by URN has been deprecated in ValueSet files.  ValueSet `$VALUESET` ignored.           | Define the value set with a name using proper syntax. |
| 1110          | Couldn’t resolve code system for alias: `$ALIAS`                   | Invalid Codesystem, double check spelling |
| 1111          | Uses statements have been deprecated in ValueSet files.  Uses statement ignored.                  | Uses statement is unnecessary. Refer to documentation for proper syntax |
| 1112          | Only default path definitions are allowed in ValueSet files.  Path definition ignored.            | Use one of the preset path definitions defined in the documentation. |
| 1113          | Failed to resolve definition for `$ELEMENT_NAME`                   | The referenced Element doesn't exist in the current namespace, or in any of its inherited parents. Check spelling errors as well as imports. |
| 1113          | Failed to resolve definition for `primitive`                       | Only certain primitives are supported. Please refer to the documentation to see the full list.
| 1115          | token recognition error at: `$CHARACTER` | This is usually a typo issue. Investigate keywords and missing colons around the specificed text input.
| 1116          | mismatched input `$INPUT` expecting `$LIST_OF_KEYWORDS` | This is usually a typo issue. Investigate spelling and keywords used around the specificied text input.
| 1117          | Cannot resolve path without namespaces | There was a failure to parse the namespace. Ensure the namespace is correctly defined.
| 1118          | Failed to resolve path for `$NAME`. |
| 1119          | Found conflicting path for `$NAME` in multiple namespaces: `$NAMESPACES` | 
| 1120          | Failed to resolve vocabulary for `$NAME`. | 
| 1121          | Found conflicting vocabularies for `$NAME` in multiple namespaces: `$NAMESPACES` | 
| 1122          | Found conflicting definitions for `$NAME` in multiple namespaces: `$NAMESPACES` | 
| 1201          | Cannot resolve element definition.                                 | Element doesn't exist. Double check spelling and inheritance |
| 1202          | Reference to non-existing base: `$ELEMENT_NAME`                    | Base doesn't exist. Double check spelling and inheritance. |
| 1203          | No cardinality found for value: `$VALUE`                           | Explicitly define cardinality for that value. |
| 1204          | No cardinality found for field: `$FIELD`                           | Explicity define cardinality for that field. |
| 1205          | Cannot override `$OLD_VALUE` with `$NEW_VALUE`                                                | Double check types match. |
| 1206          | Cannot override `$OLD_VALUE` with `$NEW_VALUE` since it is not one of the options             | Verify Identifiers match. |
| 1207          | Cannot override `$OLD_VALUE` with `$NEW_VALUE`                                                | Verify Identifiers match. |
| 1208          | Cannot override `$OLD_VALUE` with `$NEW_VALUE` since overriding ChoiceValue is not supported  | Verify Identifiers match. |
| 1209          | Unsupported constraint type: `$CONSTRAINT` Invalid constraint syntax.    | Consult documentation to see what constraints are supported |
| 1210          | Cannot constrain cardinality of `$NAME` from `$SMALL_CARDINALITY` to `$BIGGER_CARDINALITY`              | You can only narrow the cardinality. You cannot constrain it to have a larger range than its parent |
| 1211          | Cannot further constrain cardinality of `$NAME` from `$CARDINALITY` to `$CARDINALITY`      | You can only narrow the cardinality. You cannot constrain it to have a larger range than its parent |
| 1212          | Cannot constrain type of `$NAME` to `$TYPE`                        | Make sure base types match |
| 1213          | Cannot constrain type of `$NAME` since it has no identifier        | Invalid Element |
| 1214          | Cannot constrain type of `$NAME` to `$TYPE`                        | Make sure base types match |
| 1215          | Cannot further constrain type of `$NAME` from `$TYPE` to `$TYPE`   | The two elements aren't based on the same parent. You cannot constrain an element to one that is completely distinct. |
| 1217          | Cannot constrain type of `$NAME` since it has no identifier        | |
| 1218          | Cannot constrain element `$NAME` to `$TARGET` since it is an invalid sub-type | Element has to be based on `$s` or otherwise is a child of `$s`. |
| 1220          | Cardinality of `$NAME` not found                                   | Please explicitly define the cardinality. |
| 1221          | Cannot include cardinality on `$NAME`, cardinality of `$CARD` doesnt fit within `$CARD` | The cardinality of included parameters must be as narrow or narrower than the  property it contains. |
| 1222          | Cannot constrain valueset of `$NAME` since it has no identifier    | |
| 1223          | Cannot constrain valueset of `$NAME` since neither it nor its value is a code, Coding, or CodeableConcept                              | ? |
| 1224          | Cannot constrain valueset of `$NAME` since it is already constrained to a single code                                                  | ? |
| 1225          | Cannot constrain code of `$NAME` since neither it nor its value is a code, based on a Coding, or based on CodeableConcept              | ? |
| 1226          | Cannot constrain included code of `$NAME` since neither it nor its value is a code, based on a Coding, or based on CodeableConcept     | ? |
| 1227          | Cannot constrain boolean value of `$NAME` since neither it nor its value is a boolean                                                  | ? |
| 1228          | Cannot constrain boolean value of `$NAME` to `$VALUE` since a previous constraint constrains it to `$VALUE`                                        | ? |
| 1229          | Cannot resolve element definition for `$NAME`                      | This is due to a incomplete definition for an element. Please refer to the document for proper definition syntax. |
| 1230          | Cannot determine target item                                       | System error. |
| 1231          | Cannot resolve data element definition from path: `$PATH`          | Check spelling for field or value. |
| 1232          | Cannot resolve data element definition from path: `$PATH`          | Check spelling for field or value. |
| 1233          | Cannot map Value since element does not define a value             | Define a value for your element |
| 1234          | Cannot map Value since it is unsupported type: `$VALUE_TYPE`       | ? |
| 1235          | Found multiple matches for field `$FIELD`                          | Please use fully qualified identifier. |
| 1401          | Unsupported value set rule type: `$s` |
| 1402          | Unknown type for value `$VALUE` |
| 1403          | Unknown type for constraint `$CONSTRAINT` |

### Mapping Errors

| Error Code    | Error Message | Solution |
| ------------  | ------------- | -------- |
| 1301          | Invalid FHIR target: `$TARGET` |
| 1302          | Cannot flag path as mapped |
| 1303          | Splicing on include type constraints with paths is not supported |
| 1304          | Slicing required to disambiguate multiple mappings to `$TARGET` |
| 1305          | Invalid source path |
| 1306          | Invalid or unsupported target path |
| 1307          | Cannot unroll contentReference `$CONTENT_REFERENCE` on `$ELEMENT` because it is not a local reference |
| 1308          | Invalid content reference on `$ELEMENT`: `$CONTENT_REFERENCE` |
| 1309          | Cannot unroll `$ELEMENT`. Create an explicit choice element first. |
| 1310          | Cannot unroll `$ELEMENT` at `$ELEMENT`: invalid SHR element. |
| 1311          | Cannot make choice element explicit since it is not a choice ([x]): `$ELEMENT` |
| 1312          | Cannot make choice element explicit at `$ELEMENT`. Invalid SHR identifier: `$IDENTIFIER`. |
| 1313          | Invalid target path. Cannot apply cardinality constraint. |
| 1314          | Cannot constrain cardinality from `$CARD` to `$CARD` |
| 1315          | Invalid target path. Cannot apply fixed value. |
| 1316          | Currently, only fixing codes is supported (value must contain "#").  Unable to fix to `$VALUE`. |
| 1317          | Incompatible cardinality (using aggregation). Source cardinality `$CARD` does not fit in target cardinality       | |
| 1318          | Cannot constrain cardinality to `$CARD` because cardinality placement is ambiguous. Explicitly constrain          | parent elements in target path.
| 1319          | Cannot constrain cardinality to `$CARD` because there is no tail cardinality min that can get us there |
| 1320          | Cannot constrain cardinality to `$CARD` because there is no tail cardinality max that can get us there |
| 1321          | Cannot constrain cardinality to `$CARD` because there is no tail cardinality that can get us there |
| 1322          | Mismatched types. Cannot map `$SOURCE_VALUE` to `$MAPPING`. |
| 1323          | Cannot resolve element definition for `$ELEMENT` |
| 1324          | Failed to resolve element path from `$ELEMENT` to `$PATH` |
| 1325          | Applying constraints to profiled children not yet supported. SHR doesn\ |
| 1326          | Failed to resolve path from `$ELEMENT` to `$PATH` |
| 1327          | Unsupported binding strength: `$BINDING_STRENGTH` |
| 1328          | Cannot change binding strength from `$BINDING_STRENGTH` to `$BINDING_STRENGTH` |
| 1329          | Cannot override value set constraint from `$URI` to `$URI` |
| 1330          | Found more than one value set to apply to `$ELEMENT`. This should never happen and is probably a bug in the tool. |
| 1331          | Found more than one code to fix on `$ELEMENT`. This should never happen and is probably a bug in the tool. |
| 1332          | Can’t fix code on `$ELEMENT` because source value isn’t code-like. This should never happen and is probably a bug in the tool. |
| 1333          | Can’t fix code on `$ELEMENT` because source value isn’t code-like. This should never happen and is probably a bug in the tool. |
| 1334          | Cannot override code constraint from `$VALUE` to `$VALUE` |
| 1335          | Cannot override boolean constraint from `$VALUE` to `$VALUE` |
| 1336          | Found more than one boolean to fix on `$ELEMENT`. This should never happen and is probably a bug in the tool. |
| 1337          | Conversion from `$VALUE` to one of `$TYPE` drops boolean constraints |
| 1338          | Conversion from `$VALUE` to one of `$TYPE` drops value set constraints |
| 1339          | Conversion from `$VALUE` to one of `$TYPE` drops code constraints |
| 1340          | Conversion from `$VALUE` to one of `$TYPE` drops includesCode constraints |
| 1341          | Unable to establish namespace for `$ELEMENT` |
| 1342          | No slice name supplied for target. This should never happen and is probably a bug in the tool. |
| 1343          | Couldn’t find target in slice `$SLICE` | (Exporting) |
| 1344          | Target resolves to multiple elements but is not sliced |
| 1345          | Unable to establish namespace for `$FIELD` | (Extensions) |

# Code Number Explanation

***1*** 2 3 4 <br>
&nbsp;↳&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;First digit tells whether it is an warning or error. 0 = warning, 1 = error <br>

1 ***2*** 3 4 <br>
&nbsp;&nbsp;&nbsp;↳&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Second digit gives the location of the issue: 1 = the grammar and importing of the text files, 2 = the expanding of the specifications, 3 = the exporting of FHIR profiles, 4 = the exporting of the JSON profiles <br>

1 2 ***3 4*** <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳&nbsp;&nbsp; The last two digits are simply for unique identification. <br>
