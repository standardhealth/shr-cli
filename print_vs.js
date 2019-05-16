const urlsToNames = {
  'https://sdt.cap.org': 'College of American Pathologists',
  'http://www.dsm5.org/': 'DSM-5',
  'https://evs.nci.nih.gov/ftp1/CDISC/SDTM/': 'CDISC SDTM Controlled Terminology',
  'http://www.genenames.org': 'Hugo Gene Nomenclature Committee',
  'http://hl7.org/fhir/quantity-comparator': 'FHIR Quantity Comparator',
  'http://hl7.org/fhir/sid/cvx': 'CVX',
  'http://hl7.org/fhir/allergy-verification-status': 'FHIR Allergy Intolerance Verification Status',
  'http://hl7.org/fhir/observation-status': 'FHIR Observation Status',
  'http://hl7.org/fhir/ValueSet/allergy-intolerance-category': 'FHIR Allergy Intolerance Category',
  'http://hl7.org/fhir/ValueSet/allergy-intolerance-type': 'FHIR Allergy Intolerance Category',
  'http://hl7.org/fhir/observation-category': 'FHIR Observation Category',
  'http://hl7.org/fhir/v3/ActReason': 'HL7 V3 ActReason',
  'http://hl7.org/fhir/v3/ObservationInterpretation': 'HL7 V3 Observation Interpretation',
  'http://hl7.org/fhir/v2/0487': 'HL7 V2 Specimen Type',
  'http://loinc.org': 'LOINC',
  'http://www.meddra.org': 'MedDRA',
  'http://www.nationsonline.org/oneworld/country_code_list': 'CC',
  'https://www.ncbi.nlm.nih.gov/refseq': 'NCBI Reference Sequence Database',
  'http://ncimeta.nci.nih.gov': 'NCI Metathesaurus',
  'http://uts.nlm.nih.gov/metathesaurus': 'NCI Metatheasurus',
  'https://ncit.nci.nih.gov': 'NCI Thesaurus',
  'https://ncit.nci.nih.gov/ncitbrowser/ConceptReport.jsp?dictionary=NCI_Thesaurus': 'NCI Thesaurus',
  'http://www.nlm.nih.gov/research/umls/rxnorm': 'RxNorm',
  'http://snomed.info/sct': 'SNOMED CT',
  'http://hl7.org/fhir/sid/icd-10-cm': 'ICD-10-CM',
  'http://unitsofmeasure.org': 'UCUM',
  'http://codes.iarc.fr/topography': 'ICD-O-3 Topology Codes',
  'urn:iso:std:iso:4217': 'CURRENCY',
  'urn:tbd:': 'TBD',
  'urn:tbd': 'TBD'
};

module.exports = function printValueSets(specs, config) {
  const vsMap = new Map();
  for (const de of specs.dataElements.all) {
    const valueAndFields = [de.value, ...de.fields];
    for (const f of valueAndFields) {
      if (!f) continue; // no field
      const cpRules = (specs.contentProfiles.findRulesByIdentifierAndField(de.identifier, f.identifier));
      if (!(cpRules.length > 0)) continue; // no content profile rules, so nothing is must-support
      const mustSupport = cpRules.some(r => r.mustSupport);
      if (!mustSupport) continue; // no content profile rules are must-support
      if (f.constraintsFilter.valueSet.hasConstraints) {
        for (const vsConstraint of f.constraintsFilter.valueSet.constraints) {
          if (!vsConstraint.valueSet.startsWith(config.projectURL)) continue; // ignore external VS
          const vs = specs.valueSets.findByURL(vsConstraint.valueSet);
          vsMap.set(vsConstraint.valueSet, vs);
        }
      }
    }
  }

  const valueSetDetailsLines = [['Value Set', 'Code System', 'Code', 'Code Description']];
  for (const vs of vsMap.values()) {
    for (const rule of vs.rulesFilter.includesCode.rules) {
      valueSetDetailsLines.push([
        vs.identifier.name,
        urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
        `${rule.code.code}`,
        `${rule.code.display}`
      ]);
    }
    for (const rule of vs.rulesFilter.includesDescendents.rules) {
      valueSetDetailsLines.push([
        vs.identifier.name,
        urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
        `includes codes descending from ${rule.code.code}`,
        `${rule.code.display}`
      ]);
    }
    for (const rule of vs.rulesFilter.includesFromCode.rules) {
      valueSetDetailsLines.push([
        vs.identifier.name,
        urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
        `includes codes from code ${rule.code.code}`,
        `${rule.code.display}`
      ]);
    }
    for (const rule of vs.rulesFilter.includesFromCodeSystem.rules) {
      valueSetDetailsLines.push([
        vs.identifier.name,
        urlsToNames[rule.system] ? urlsToNames[rule.system] : rule.system,
        `includes codes from code system ${urlsToNames[rule.system] ? urlsToNames[rule.system] : rule.system}`,
        ''
      ]);
    }
    for (const rule of vs.rulesFilter.excludesDescendents.rules) {
      valueSetDetailsLines.push([
        vs.identifier.name,
        urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
        `excludes codes descending from ${rule.code.code}`,
        `${rule.code.display}`
      ]);
    }
  }

  const valueSetLines = [['Value Set', 'Description', 'Code Systems']];
  for (const vs of vsMap.values()) {
    let codeSystems = new Set();
    for (const rule of vs.rulesFilter.includesCode.rules) {
      codeSystems.add(urlsToNames[rule.code.system]);
    }
    for (const rule of vs.rulesFilter.includesDescendents.rules) {
      codeSystems.add(urlsToNames[rule.code.system]);
    }
    for (const rule of vs.rulesFilter.includesFromCode.rules) {
      codeSystems.add(urlsToNames[rule.code.system]);
    }
    for (const rule of vs.rulesFilter.includesFromCodeSystem.rules) {
      codeSystems.add(urlsToNames[rule.system]);
    }
    for (const rule of vs.rulesFilter.excludesDescendents.rules) {
      codeSystems.add(urlsToNames[rule.code.system]);
    }
    codeSystems.delete(null);
    codeSystems.delete(undefined);
    valueSetLines.push([
      vs.identifier.name,
      `${vs.description ? vs.description : ''}`,
      `${Array.from(codeSystems).join(', ')}`
    ]);
  }

  return { valueSetLines, valueSetDetailsLines };
};