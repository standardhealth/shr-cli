const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

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
  'http://loinc.org': 'LOINC',
  'http://www.meddra.org': 'MedDRA',
  'http://www.nationsonline.org/oneworld/country_code_list': 'CC',
  'https://www.ncbi.nlm.nih.gov/refseq': 'NCBI Reference Sequence Database',
  'http://ncimeta.nci.nih.gov': 'NCI Metathesaurus',
  'https://ncit.nci.nih.gov/ncitbrowser/ConceptReport.jsp?dictionary=NCI_Thesaurus': 'NCI Thesaurus',
  'http://www.nlm.nih.gov/research/umls/rxnorm': 'RxNorm',
  'http://snomed.info/sct': 'SNOMED CT',
  'http://hl7.org/fhir/sid/icd-10-cm': 'ICD-10-CM',
  'http://unitsofmeasure.org': 'UCUM',
  'http://uts.nlm.nih.gov/metathesaurus': 'NCI Metatheasurus',
  'urn:iso:std:iso:4217': 'CURRENCY',
  'urn:tbd:': 'TBD',
  'urn:tbd': 'TBD'
};

module.exports = function printValueSets(specs, config, out) {
  mkdirp.sync(out);
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

  const lines = ['Value Set,Description,Code System,Logical Definition,Code and Description'];
  for (const vs of vsMap.values()) {
    for (const rule of vs.rulesFilter.includesCode.rules) {
      lines.push([
        vs.identifier.name,
        `"${vs.description ? vs.description : ''}"`,
        urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
        '',
        `"${rule.code.code} ${rule.code.display}"`
      ].join(','));
    }
    for (const rule of vs.rulesFilter.includesDescendents.rules) {
      lines.push([
        vs.identifier.name,
        `"${vs.description ? vs.description : ''}"`,
        urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
        `"includes codes descending from ${rule.code.code} ${rule.code.display}"`,
        ''
      ].join(','));
    }
    for (const rule of vs.rulesFilter.includesFromCode.rules) {
      lines.push([
        vs.identifier.name,
        `"${vs.description ? vs.description : ''}"`,
        urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
        `"includes codes from code ${rule.code.code} ${rule.code.display}"`,
        ''
      ].join(','));
    }
    for (const rule of vs.rulesFilter.includesFromCodeSystem.rules) {
      lines.push([
        vs.identifier.name,
        `"${vs.description ? vs.description : ''}"`,
        urlsToNames[rule.system] ? urlsToNames[rule.system] : rule.system,
        `"includes codes from code system ${urlsToNames[rule.system] ? urlsToNames[rule.system] : rule.system}"`,
        ''
      ].join(','));
    }
    for (const rule of vs.rulesFilter.excludesDescendents.rules) {
      lines.push([
        vs.identifier.name,
        `"${vs.description ? vs.description : ''}"`,
        urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
        `"excludes codes descending from ${rule.code.code} ${rule.code.display}"`,
        ''
      ].join(','));
    }
  }
  fs.writeFileSync(path.join(out, 'valuesets.csv'), lines.join('\n'));
};