# Holdout rationale (NEWS2 scores: RR / SpO2 / O2 / SBP / pulse / consciousness / temp)

- H01: ACS (radiation, sweating, exertional) + syncope with exertional chest pain; GCS 15 so no low-GCS. RR20=0, SpO2 96=0, air=0 (assumed), SBP152=0, HR102=1, alert=0, T36.9=0 -> 1 low complete.
- H02: sepsis (fever + UTI source, NEWS2>=5), delirium (72 + new confusion, no deficit), NEWS2 high. RR24=2, SpO2 94=1, air=0, SBP96=2, HR118=2, new confusion=3, T39.2=2 -> 12 high complete. SBP not <90 so no hypotension.
- H03: PE (SOB/pleuritic pain + unilateral leg swelling + oestrogen), hypoxia (90<92), NEWS2 high; ACS near-miss (age 34, no radiation/sweat/exertion). RR24=2, SpO2 90=3, air=0, SBP118=0, P112=2, alert=0, T37.4=0 -> 7 high complete.
- H04: stroke (unilateral weakness, speech, droop) + HTN emergency (SBP 196 with neuro deficit); "sudden" attaches to weakness, no headache -> no thunderclap. RR18=0, SpO2 97=0, air=0, SBP196=0, HR88=0, alert=0, T36.9=0 -> 0 low complete.
- H05: thunderclap ("sudden" headache, worst ever, peak <1 min); BP 164/96 below severe thresholds; "No fever". Measured 3/5 (SBP164=0, P84=0, T37.0=0) + air=0, alert=0 -> 0 low partial.
- H06: meningitis (fever + neck stiffness + photophobia), sepsis (fever + NEWS2 6), NEWS2 medium. RR22=2, SpO2 97=0, air=0, SBP112=0, P116=2, alert=0, T39.4=2 -> 6 medium complete.
- H07: DKA (ketones 4.2 with diabetes; glucose 420 with vomiting/abdo pain; critical), severe hyperglycaemia suppressed because DKA fired; "no guarding" negates peritonism. RR28=3, SpO2 98=0, air=0, SBP108=1, P120=2, alert=0, T37.2=0 -> 6 medium complete.
- H08: GI bleed (melaena, unstable), hypotension (86<90), NEWS2 high; presyncope only, no syncope rule. RR22=2, SpO2 95=1, air=0, SBP86=3, HR124=2, alert=0, T36.4=0 -> 8 high complete.
- H09: anaphylaxis (throat tightness/wheeze/lip swelling + allergen + urticaria); SBP 98 not <90, SpO2 93 not <92. RR26=3, SpO2 93=2, air=0, SBP98=2, P118=2, alert=0, T36.8=0 -> 9 high complete.
- H10: testicular torsion (testicular pain + sudden onset + age 17 <25); age 17 is adult so NEWS2 applies. RR18=0, SpO2 99=0, air=0, SBP128=0, P96=1, alert=0, T37.1=0 -> 1 low complete.
- H11: cauda equina (saddle numbness; retention with back pain and bilateral leg symptoms). RR16=0, SpO2 98=0, air=0, SBP138=0, HR82=0, alert=0, T36.7=0 -> 0 low complete.
- H12: tricky negative: chest pain/SOB/headache/visual sx all denied, MI and stroke are family history -> no ACS/stroke/HTN-emergency; residual HTN-SEVERE (SBP 184 without symptoms). RR16=0, SpO2 98=0, air=0, SBP184=0, P78=0, alert=0, T36.6=0 -> 0 low complete.
- H13: tricky negative: denies SI, self-harm and plans -> no suicide flag. Only BP and HR given (2/5) -> insufficient, band/total null.
- H14: tricky negative: TIA in the past, fully resolved, deficits and confusion explicitly negated -> no stroke/delirium. RR16=0, SpO2 96=0, air=0, SBP138=0, P72=0, alert=0, T36.7=0 -> 0 low complete.
- H15: tricky negative: headache gradual; "sudden" attached to nausea in a different sentence -> no thunderclap; fever/neck stiffness/photophobia/rash negated -> no meningitis. RR14=0, SpO2 99=0, air=0, SBP124=0, P82=0, alert=0, T37.1=0 -> 0 low complete.
- H16: benign DM follow-up, glucose 126 mg/dL. RR14=0, SpO2 98=0, air=0, SBP126=0, HR74=0, alert=0, T36.6=0 -> 0 low complete.
- H17: benign URTI, T 37.6 (<38, no fever word). RR16=0, SpO2 98=0, air=0, SBP118=0, P88=0, alert=0, T37.6=0 -> 0 low complete.
- H18: benign levothyroxine refill. RR14=0, SpO2 99=0, air=0, SBP112=0, P68=0, alert=0, T36.5=0 -> 0 low complete.
- H19: edge pregnancy: pre-eclampsia (34 wks, BP 162/112 >=160/110 -> critical, headache, visual disturbance, oedema); HTN rules excluded by pregnancy; no bleeding/abdo pain (negated) -> no pregnancy-pain-bleeding; FM normal -> no RFM. NEWS2 not applicable (pregnancy).
- H20: edge child: infant fever (8 weeks <3 months, 38.6), paediatric red features (grunting, RR 64 >60); fontanelle flat (no bulging) so no meningitis; adult-only sepsis not applicable. NEWS2 not applicable (age <16).
# Holdout set 2 (H21–H40): rationale

NEWS2 order: RR / SpO2 / air-O2 / SBP / HR / consciousness / Temp. Air and alert assumed when not stated.

- H21: hypoglycaemia in mmol/L (3.1 mmol/L ≈ 56 mg/dL, so ≥ 54: urgent), alert. RR16=0 SpO2 98=0 air=0 SBP132=0 HR98=1 alert=0 T36.7=0 -> complete 1 low.
- H22: suicidal thoughts and a plan, with self-harm explicitly not present. RR14=0 SpO2 99=0 air=0 SBP118=0 HR82=0 alert=0 T36.8=0 -> complete 0 low.
- H23: post-menopausal bleeding (cancer feature) plus asymptomatic BP 184/96 with all emergency symptoms denied (HTN-SEVERE, not EMERGENCY). RR16=0 SpO2 97=0 air=0 SBP184=0 HR78=0 alert=0 T36.6=0 -> complete 0 low.
- H24: GCS 12 after a seizure with new confusion, limbs moving equally (no neuro deficit), age 52 (no delirium), normal glucose. RR10=1 SpO2 95=1 air=0 SBP150=0 HR64=0 confusion=3 T36.5=0 -> complete 5 medium.
- H25: guarding and rebound in RIF, hCG negative, fever without sepsis criteria (NEWS2 2, qSOFA 0). RR20=0 SpO2 98=0 air=0 SBP118=0 HR108=1 alert=0 T38.4=1 -> complete 2 low.
- H26: 8 weeks pregnant with PV spotting, iliac fossa pain and shoulder-tip pain; SBP 98 is not < 90. Pregnancy -> NEWS2 not applicable, no NEWS2 flags.
- H27: 34 weeks with reduced fetal movements; pain, bleeding, headache and visual symptoms denied; normal BP (no pre-eclampsia). Pregnancy -> not applicable.
- H28: glucose 452 mg/dL with ketones 0.4 and vomiting, abdominal pain and SOB denied, alert -> DKA does not fire, severe hyperglycaemia does. SpO2 not given. RR18=0 SBP142=0 HR92=1 T36.9=0 + air 0 + alert 0 -> partial (4/5) 1 low.
- H29: pyelonephritis (infection source plus fever), NEWS2 8 and qSOFA 2 (RR ≥ 22, SBP ≤ 100); not pregnant; SBP 94 is not < 90. RR24=2 SpO2 96=0 air=0 SBP94=2 HR124=2 alert=0 T39.4=2 -> complete 8 high.
- H30: exertional chest tightness radiating to the arm, with diabetes and hypertension; BP 158/94 is below the severe threshold. RR22=2 SpO2 95=1 air=0 SBP158=0 HR104=1 alert=0 T36.8=0 -> complete 4 low (no single 3).
- H31: PE on supplemental oxygen (pleuritic pain, SOB, recent surgery, oestrogen, unilateral calf swelling); age 36 with no radiation, sweating, exertion or CAD, so ACS does not fire; SpO2 93 is not < 92. RR24=2 SpO2 93=2 O2=2 SBP112=0 HR116=2 alert=0 T37.4=0 -> complete 8 high.
- H32: tricky negative. Family history of MI and cancer only; chest pain, SOB and palpitations denied. All parameters 0 -> complete 0 low.
- H33: tricky negative. Previous DVT and a resolved TIA, current neuro deficit, SOB, chest pain and calf swelling all denied. SBP136=0 HR70=0 T36.6=0 (3/5) -> partial 0 low.
- H34: tricky negative. Idiom "the burning is killing me" (not suicidal); cancer and stroke only in relatives; uncomplicated cystitis without fever; not pregnant. All parameters 0 -> complete 0 low.
- H35: tricky negative. "No hypos", glucose 7.2 mmol/L, negated cancer features (weight loss, rectal bleeding, dysphagia), bilateral symmetric numbness (not unilateral, so not a neuro deficit). SBP134=0 HR76=0 SpO2 97=0 (3/5) -> partial 0 low.
- H36: benign URTI. RR14=0 SpO2 98=0 SBP122=0 HR80=0 T37.2=0 -> complete 0 low.
- H37: benign mechanical back pain; saddle numbness and bladder or bowel problems denied. SBP118=0 HR74=0 T36.6=0 (3/5) -> partial 0 low.
- H38: benign chronic eczema (a rash, but not non-blanching). RR12=0 SpO2 99=0 SBP124=0 HR68=0 T36.4=0 -> complete 0 low.
- H39: edge case, child aged 6 with fever. RR 28 would score 3 in an adult, but NEWS2 is not applicable, so neither NEWS2 flag fires; paediatric red features and meningitis features are denied, and the child is too old for infant fever. Sepsis is for adults only.
- H40: edge case with too few vitals (SpO2 and HR only = 2/5 -> insufficient). SpO2 90 scores 3, so NEWS2-MEDIUM fires without a total; SpO2 < 92 fires HYPOXIA (no COPD). No fever, and sepsis cannot be calculated.
