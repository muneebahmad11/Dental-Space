import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demographicBody,blankDemographicBody } from '../src/lib/patient-profile/contracts.ts';
test('unknown DOB stays unknown and reported age requires its own date',()=>{
 assert.equal(demographicBody.safeParse(blankDemographicBody).success,true);assert.equal(demographicBody.safeParse({...blankDemographicBody,reportedAge:30,ageAsOf:'2026-10-09'}).success,true);assert.equal(demographicBody.safeParse({...blankDemographicBody,reportedAge:30}).success,false);assert.equal(demographicBody.safeParse({...blankDemographicBody,reportedAge:30,ageAsOf:'2026-10-09',dob:'1990-01-01'}).success,false);
});
test('demographic fields reject clinical data and invalid dates/contact values',()=>{
 for(const patch of [{dob:'2026-02-30'},{alternatePhone:'not a phone'},{status:'deleted'},{medicalHistory:'restricted'},{reportedAge:1.5,ageAsOf:'2026-10-09'}])assert.equal(demographicBody.safeParse({...blankDemographicBody,...patch}).success,false);
});
