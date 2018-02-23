# Common Error Codes

| Number        | Message       | Solution |
| ------------  | ------------- | -------- |
| 11013          | Failed to resolve definition for `$ELEMENT_NAME`  | The referenced Element doesn't exist in the current namespace, or in any of its inherited parents. Check spelling errors as well as imports. |
| 13041          | Unable to establish namespace for `$ELEMENT_NAME`  | Double check imports and element name spelling. |
| 02001          | WARN shr: Potentially mismatched targets. Based on class (shr.core.Duration) maps to Duration. |
| 03004          | Element profiled on Basic. Consider a more specific mapping. | The Basic profile should not be used in most cases. Consider a more specific profile mapping that categorizes the Element being mapped.
| 11015          | token recognition error at: `$CHARACTER` | This is usually a typo issue. Investigate keywords and missing colons around the specificed text input.
| 11016          | mismatched input `$INPUT` expecting `$LIST_OF_KEYWORDS` | This is usually a typo issue. Investigate spelling and keywords used around the specificied text input.
| 11023          | extraneous input `$INPUT` expecting `$LIST_OF_KEYWORDS` | This is usually a typo issue. Investigate spelling and keywords used around the specificied text input.
| 12004          | No cardinality found for field: `$FIELD`                           | Explicity define cardinality for that field. |
| 12010          | Cannot constrain cardinality of `$NAME` from `$SMALL_CARDINALITY` to `$BIGGER_CARDINALITY`              | You can only narrow the cardinality. You cannot constrain it to have a larger range than its parent |
| 12005          | Cannot override `$OLD_VALUE` with `$NEW_VALUE`                     | Double check types match. |
| 12001          | Cannot resolve element definition.                                 | Element doesn't exist. Double check spelling and inheritance |
| 11001          | Element name '`$NAME`' should begin with a capital letter          | Rename the specified Element |
| 03005          | No mapping to '`$ELEMENT PATH`'. This property is core to the target resource and usually should be mapped.
| 13022          | Mismatched types. Cannot map `$SOURCE_VALUE` to `$MAPPING`. |

# All Warning Codes

| Warning Code | Warning Message | Solution |
| ------------ | --------------- | -------- |
| 01001 | No project configuration file found, currently using default EXAMPLE identifiers. Auto-generating a proper 'config.json' in your specifications folder | Open the 'config.json' file and customize it for your project.
| 01002 | Config file missing key: `$KEY`, using default key: `$DEFAULT VALUE` instead.   | Open the 'config.json' file and add your project specific details for that key.
| 02001 | Potentially mismatched targets: `$CLASS` maps to `$ITEM`, but based on class (`$CLASS`) maps to `$ITEM`, and `$ITEM` is not based on `$ELEMENT` in `$CLASS`.' | You're overwriting an inherited mapping. This is not necessarily an issue, but is definitely something to be cautious of. |
| 03001 | Trying to map `$PROFILE` to `$CODE`, but `$PROFILE` was previously mapped to it |
| 03002 | Choice has equivalent types, so choice options may overwrite or override each other when mapped to FHIR. |
| 03003 | Overriding extensible value set constraint from `$VS` to `$VS`.  Only allowed when new codes do not overlap meaning of old codes. |
| 03004 | Element profiled on Basic. Consider a more specific mapping. | The Basic profile should not be used in most cases. Consider a more specific profile mapping that categorizes the Element being mapped. |
| 03005 | No mapping to '`$ELEMENT PATH`'. This property is core to the target resource and usually should be mapped. |
| 03006 | The `$PROPERTY` property is not bound to a value set, fixed to a code, or fixed to a quantity unit. This property is core to the target resource and usually should be constrained |
| 04001 | Unsupported code system: '`$CODESYSTEM`' |

# All Error Codes

| Error Code    | Error Message | Solution |
| ------------  | ------------- | -------- |
| 11001          | Element name '`$NAME`' should begin with a capital letter          | Rename the specified Element |
| 11002          | Entry Element name '`$NAME`' should begin with a capital letter    | Rename the specified EntryElement |
| 11003          | Unable to resolve value set reference: `$VALUESET`                 | Invalid value set reference, double check the name and the path
| 11004          | Unsupported binding strength: `$BINDING_STRENGTH`.  Defaulting to REQUIRED     | Binding strength has to be one of the following:<br>-"must be" (required)<br> -"must be X if covered" (extensible)<br> -"should be" (preferred) <br> -"could be" (optional) |
| 11005          | Error parsing source path: `$PATH`                                 | Invalid path to definitions. Double check path. |
| 11006          | Invalid config file. Should be valid JSON dictionary               | Make sure your 'config.json' file is using a valid format for JSON. |
| 11007          | Unsupported grammar version: `$VERSION`                            | Grammar Version for file must be 5.0 (or above) |
| 11008          | Defining value sets by URL has been deprecated in ValueSet files.  ValueSet `$VALUESET` ignored.           | Define the value set with a name using proper syntax. |
| 11009          | Defining value sets by URN has been deprecated in ValueSet files.  ValueSet `$VALUESET` ignored.           | Define the value set with a name using proper syntax. |
| 11010          | Couldn’t resolve code system for alias: `$ALIAS`                   | Invalid Codesystem, double check spelling |
| 11011          | Uses statements have been deprecated in ValueSet files.  Uses statement ignored.                  | Uses statement is unnecessary. Refer to documentation for proper syntax |
| 11012          | Only default path definitions are allowed in ValueSet files.  Path definition ignored.            | Use one of the preset path definitions defined in the documentation. |
| 11013          | Failed to resolve definition for `$ELEMENT_NAME`                   | The referenced Element doesn't exist in the current namespace, or in any of its inherited parents. Check spelling errors as well as imports. |
| 11013          | Failed to resolve definition for `primitive`                       | Only certain primitives are supported. Please refer to the documentation to see the full list.
| 11015          | token recognition error at: `$CHARACTER` | This is usually a typo issue. Investigate keywords and missing colons around the specificed text input.
| 11016          | mismatched input `$INPUT` expecting `$LIST_OF_KEYWORDS` | This is usually a typo issue. Investigate spelling and keywords used around the specificied text input.
| 11017          | Cannot resolve path without namespaces | There was a failure to parse the namespace. Ensure the namespace is correctly defined.
| 11018          | Failed to resolve path for `$NAME`. |
| 11019          | Found conflicting path for `$NAME` in multiple namespaces: `$NAMESPACES` |
| 11020          | Failed to resolve vocabulary for `$NAME`. |
| 11021          | Found conflicting vocabularies for `$NAME` in multiple namespaces: `$NAMESPACES` |
| 11022          | Found conflicting definitions for `$NAME` in multiple namespaces: `$NAMESPACES` |
| 11023          | Elements cannot be based on "Value" keyword |
| 11024          | Elements cannot use "Value:" modifier and specify "Value" field at same time. |
| 11025          | Fields cannot be constrained to type "Value" |
| 11026          | ref(Value) is an unsupported construct; treating as Value without the reference. |
| 12001          | Cannot resolve element definition.                                 | Element doesn't exist. Double check spelling and inheritance |
| 12002          | Reference to non-existing base: `$ELEMENT_NAME`                    | Base doesn't exist. Double check spelling and inheritance. |
| 12003          | No cardinality found for value: `$VALUE`                           | Explicitly define cardinality for that value. |
| 12004          | No cardinality found for field: `$FIELD`                           | Explicity define cardinality for that field. |
| 12005          | Cannot override `$OLD_VALUE` with `$NEW_VALUE`                                                | Double check types match. |
| 12006          | Cannot override `$OLD_VALUE` with `$NEW_VALUE` since it is not one of the options             | Verify Identifiers match. |
| 12007          | Cannot override `$OLD_VALUE` with `$NEW_VALUE`                                                | Verify Identifiers match. |
| 12008          | Cannot override `$OLD_VALUE` with `$NEW_VALUE` since overriding ChoiceValue is not supported  | Verify Identifiers match. |
| 12009          | Unsupported constraint type: `$CONSTRAINT` Invalid constraint syntax.    | Consult documentation to see what constraints are supported |
| 12010          | Cannot constrain cardinality of `$NAME` from `$SMALL_CARDINALITY` to `$BIGGER_CARDINALITY`              | You can only narrow the cardinality. You cannot constrain it to have a larger range than its parent |
| 12011          | Cannot further constrain cardinality of `$NAME` from `$CARDINALITY` to `$CARDINALITY`      | You can only narrow the cardinality. You cannot constrain it to have a larger range than its parent |
| 12012          | Cannot constrain type of `$NAME` to `$TYPE`                        | Make sure base types match |
| 12013          | Cannot constrain type of `$NAME` since it has no identifier        | Invalid Element |
| 12014          | Cannot constrain type of `$NAME` to `$TYPE`                        | Make sure base types match |
| 12015          | Cannot further constrain type of `$NAME` from `$TYPE` to `$TYPE`   | The two elements aren't based on the same parent. You cannot constrain an element to one that is completely distinct. |
| 12017          | Cannot constrain type of `$NAME` since it has no identifier        | |
| 12018          | Cannot constrain element `$NAME` to `$TARGET` since it is an invalid sub-type | Element has to be based on `$s` or otherwise is a child of `$s`. |
| 12020          | Cardinality of `$NAME` not found                                   | Please explicitly define the cardinality. |
| 12021          | Cannot include cardinality on `$NAME`, cardinality of `$CARD` doesnt fit within `$CARD` | The cardinality of included parameters must be as narrow or narrower than the  property it contains. |
| 12022          | Cannot constrain valueset of `$NAME` since it has no identifier    | |
| 12023          | Cannot constrain valueset of `$NAME` since neither it nor its value is a code, Coding, or CodeableConcept                              | ? |
| 12024          | Cannot constrain valueset of `$NAME` since it is already constrained to a single code                                                  | ? |
| 12025          | Cannot constrain code of `$NAME` since neither it nor its value is a code, based on a Coding, or based on CodeableConcept              | ? |
| 12026          | Cannot constrain included code of `$NAME` since neither it nor its value is a code, based on a Coding, or based on CodeableConcept     | ? |
| 12027          | Cannot constrain boolean value of `$NAME` since neither it nor its value is a boolean                                                  | ? |
| 12028          | Cannot constrain boolean value of `$NAME` to `$VALUE` since a previous constraint constrains it to `$VALUE`                                        | ? |
| 12029          | Cannot resolve element definition for `$NAME`                      | This is due to a incomplete definition for an element. Please refer to the document for proper definition syntax. |
| 12030          | Cannot determine target item                                       | System error. |
| 12031          | Cannot resolve data element definition from path: `$PATH`          | Check spelling for field or value. |
| 12032          | Cannot resolve data element definition from path: `$PATH`          | Check spelling for field or value. |
| 12033          | Cannot map Value since element does not define a value             | Define a value for your element |
| 12034          | Cannot map Value since it is unsupported type: `$VALUE_TYPE`       | ? |
| 12035          | Found multiple matches for field `$FIELD`                          | Please use fully qualified identifier. |
| 12036          | Could not find expanded definition of `$ELEMENT`. Inheritance calculations will be incomplete. | Double check `shr.base.Entry` is defined within the specifications. |
| 12037          | Could not find based on element `$ELEMENT` for child element `$ELEMENT`. | Double check the `basedOn` element is defined within the specifications and correctly referenced. |
| 14001          | Unsupported value set rule type: `$s` |
| 14002          | Unknown type for value `$VALUE` |
| 14003          | Unknown type for constraint `$CONSTRAINT` |
| 15001          | Unable to successfully serialize element `$ELEMENT` into CIMCORE, failing with error `$ERROR_MSG`. |
| 15002          | Unable to successfully serialize value set `$VALUE_SET` into CIMCORE, failing with error `$ERROR_MSG`. |
| 15003          | Unable to successfully serialize mapping `$MAPPING` into CIMCORE, failing with error `$ERROR_MSG`. |
| 15004          | Unable to successfully serialize namespace meta data `$NAMESPACE` into CIMCORE, failing with error `$ERROR_MSG`. |

### Mapping Errors

| Error Code    | Error Message | Solution |
| ------------  | ------------- | -------- |
| 13001          | Invalid FHIR target: `$TARGET` |
| 13002          | Cannot flag path as mapped |
| 13003          | Splicing on include type constraints with paths is not supported |
| 13004          | Slicing required to disambiguate multiple mappings to `$TARGET` |
| 13005          | Invalid source path |
| 13006          | Invalid or unsupported target path |
| 13007          | Cannot unroll contentReference `$CONTENT_REFERENCE` on `$ELEMENT` because it is not a local reference |
| 13008          | Invalid content reference on `$ELEMENT`: `$CONTENT_REFERENCE` |
| 13009          | Cannot unroll `$ELEMENT`. Create an explicit choice element first. |
| 13010          | Cannot unroll `$ELEMENT` at `$ELEMENT`: invalid SHR element. |
| 13011          | Cannot make choice element explicit since it is not a choice ([x]): `$ELEMENT` |
| 13012          | Cannot make choice element explicit at `$ELEMENT`. Invalid SHR identifier: `$IDENTIFIER`. |
| 13013          | Invalid target path. Cannot apply cardinality constraint. |
| 13014          | Cannot constrain cardinality from `$CARD` to `$CARD` |
| 13015          | Invalid target path. Cannot apply fixed value. |
| 13016          | Currently, only fixing codes is supported (value must contain "#").  Unable to fix to `$VALUE`. |
| 13017          | Incompatible cardinality (using aggregation). Source cardinality `$CARD` does not fit in target cardinality       | |
| 13018          | Cannot constrain cardinality to `$CARD` because cardinality placement is ambiguous. Explicitly constrain          | parent elements in target path.
| 13019          | Cannot constrain cardinality to `$CARD` because there is no tail cardinality min that can get us there |
| 13020          | Cannot constrain cardinality to `$CARD` because there is no tail cardinality max that can get us there |
| 13021          | Cannot constrain cardinality to `$CARD` because there is no tail cardinality that can get us there |
| 13022          | Mismatched types. Cannot map `$SOURCE_VALUE` to `$MAPPING`. |
| 13023          | Cannot resolve element definition for `$ELEMENT` |
| 13024          | Failed to resolve element path from `$ELEMENT` to `$PATH` |
| 13025          | Applying constraints to profiled children not yet supported. SHR doesn\ |
| 13026          | Failed to resolve path from `$ELEMENT` to `$PATH` |
| 13027          | Unsupported binding strength: `$BINDING_STRENGTH` |
| 13028          | Cannot change binding strength from `$BINDING_STRENGTH` to `$BINDING_STRENGTH` |
| 13029          | Cannot override value set constraint from `$URI` to `$URI` |
| 13030          | Found more than one value set to apply to `$ELEMENT`. This should never happen and is probably a bug in the tool. |
| 13031          | Found more than one code to fix on `$ELEMENT`. This should never happen and is probably a bug in the tool. |
| 13032          | Can’t fix code on `$ELEMENT` because source value isn’t code-like. This should never happen and is probably a bug in the tool. |
| 13033          | Can’t fix code on `$ELEMENT` because source value isn’t code-like. This should never happen and is probably a bug in the tool. |
| 13034          | Cannot override code constraint from `$VALUE` to `$VALUE` |
| 13035          | Cannot override boolean constraint from `$VALUE` to `$VALUE` |
| 13036          | Found more than one boolean to fix on `$ELEMENT`. This should never happen and is probably a bug in the tool. |
| 13037          | Conversion from `$VALUE` to one of `$TYPE` drops boolean constraints |
| 13038          | Conversion from `$VALUE` to one of `$TYPE` drops value set constraints |
| 13039          | Conversion from `$VALUE` to one of `$TYPE` drops code constraints |
| 13040          | Conversion from `$VALUE` to one of `$TYPE` drops includesCode constraints |
| 13041          | Unable to establish namespace for `$ELEMENT` |
| 13042          | No slice name supplied for target. This should never happen and is probably a bug in the tool. |
| 13043          | Couldn’t find target in slice `$SLICE` | (Exporting) |
| 13044          | Target resolves to multiple elements but is not sliced |
| 13045          | Unable to establish namespace for `$FIELD` | (Extensions) |
| 13046          | Mapping to `MAP_TARGET`'s `RULE_TARGET`: slice could not be found. |
| 13047          | Couldn't find sd to unroll |
| 13048          | Cannot override code constraint from `$SYSTEM`\|`$CODE` to `$SYSTEM`\|`$CODE`' |
| 13049          | Unexpected error processing mapping to FHIR. |
| 13050          | Unexpected error processing mapping rule. |
| 13051          | Unexpected error adding extension. |
| 13054          | Using profile that is currently in the middle of processing: `$PROFILE_ID`. |
| 13055          | Using extension that is currently in the middle of processing: `$EXTENSION_ID`. |
| 13056          | Can't fix `$TARGET` to `$VALUE` since `$TARGET` is not one of: `$ALLOWABLE_TYPES`. |
| 13057          | Could not fix `$TARGET` to `$VALUE`; failed to detect compatible type for value `$VALUE`. |
| 13058          | Cannot fix `$TARGET` to `$VALUE` since it is not a `$TYPE` type. |
| 13059          | Cannot fix `$TARGET` to `$VALUE` since it is already fixed to `$OTHER_VALUE`. |
| 13060          | Could not determine how to map nested value (`$ELEMENT_PATH`) to FHIR profile. |
| 13061          | Mapping _Concept sub-fields is currently not supported. |

# Code Number Explanation

***1*** 2 3 4 5 <br>
&nbsp;↳&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;First digit tells whether it is an warning or error. 0 = warning, 1 = error <br>

1 ***2*** 3 4 5 <br>
&nbsp;&nbsp;&nbsp;↳&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Second digit gives the location of the issue: 1 = the grammar and importing of the text files, 2 = the expanding of the specifications, 3 = the exporting of FHIR profiles, 4 = the exporting of the JSON profiles, 5 = the exporting of CIMCORE files <br>

1 2 ***3 4 5*** <br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳&nbsp;&nbsp; The last two digits are simply for unique identification. <br>
