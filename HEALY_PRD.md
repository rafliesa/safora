# HEALY Product Requirements Document

| Document field | Value |
| --- | --- |
| Version | 1.1 |
| Date | 7 November 2026 |
| Product | HEALY |
| Hackathon track | Deep Domain AI |
| Platform | Web application for company HSE officers |
| Build context | Seven-hour hackathon prototype |
| Primary demonstration | Team-provided workplace video processed by AI into an HSE assessment supported by evidence |
| Environmental inputs | Hardcoded instrument readings supplied through versioned simulation fixtures |
| Current dependency | Review of the team's actual videos to confirm supported movements, camera views, and subjects |

## Current implementation slice — 7 November 2026

The current delivery builds frontend routes and backend API contracts while the video model is being trained. Video inference, actual observations, recording behavior, and footage qualification are deferred until the team supplies the model and footage. The seven-hour sequence below describes the eventual prototype, not the completion criteria for this route-only slice.

- APD detection is out of scope, including its model, screens, findings, and demo requirements.
- Daily planning assumes a local shift of 08:00–17:00 in Asia/Jakarta, a nine-hour scheduled window. This assumption supplies no measured exposure or continuous-work claim; break deductions are not yet specified.
- HEALY retains the combined calculation already defined in Sections 11–13: REBA provides posture severity, ISO 11226-inspired tracking provides observed duration and static-hold information, and the experimental HEALY formula combines these inputs. Preserve the formula and its prototype labels.
- Re-analysis separates reusable visual inference from assessment calculations and their context as defined in Section 21.
- Recording and overlapping-recording policy remain deferred. Which assessment version feeds dashboard totals also remains pending product discussion; route setup must not silently decide either policy.
- Use PRD behavior and calculation definitions when adapting the visual design. Camera-live labels and example scores in the design do not define route behavior.
- Route-only reads return honest empty states. Deferred writes return an explicit unavailable response; they do not fabricate completed jobs, assessments, or reviews.

## 1. Product purpose

HEALY helps companies recognize recurring occupational exposures and make those findings understandable enough to support earlier reporting and prevention of Penyakit Akibat Kerja, or PAK. Its prototype turns workplace video and simulated instrument readings into an assessment that an HSE officer can inspect, correct, and approve.

The underlying problem is underreporting. Workers can have limited awareness of the relationship between their work and health concerns, limited knowledge of reporting procedures, and concerns about the consequences of reporting. These barriers appear in research on occupational disease reporting. [S1]

The hackathon demonstrates the analytical part of that larger product idea. Success means an HSE officer can select the team's video, run real visual analysis, inspect the resulting evidence and metrics, and reach a documented assessment in the company dashboard. Longer-term evaluation can examine worker understanding, early reporting, and preventive follow-up.

The project aligns with Deep Domain AI through its use of occupational assessment methods, task context, and HSE interpretation of evidence.

The product produces occupational exposure findings and HSE review priorities. Occupational health professionals determine clinical diagnoses and the work-relatedness of symptoms.

## 2. Confirmed decisions

| ID | Decision |
| --- | --- |
| D-01 | The implemented interface serves the company HSE officer. |
| D-02 | The demo begins with the team's own workplace video. Its activities, camera view, and worker count are currently unconfirmed. |
| D-03 | AI must process the selected video and derive actual visual findings during the demonstrated workflow. |
| D-04 | Visual analysis covers supported posture and duration measurements, supported observable movement segments. |
| D-05 | HSE reviews the score inputs, evidence, risk band, and proposed intervention. |
| D-06 | Reviewed REBA scores use three dashboard bands, Low, Medium, and High. The original REBA action level remains visible. |
| D-07 | ISO 11226-inspired tracking supplies posture duration and continuous holding information. |
| D-08 | HEALY cumulative exposure points are an explicitly experimental prototype metric with inspectable weights and rules. |
| D-09 | Body temperature, room conditions, and noise are hardcoded as simulated outputs from assumed instruments. |
| D-10 | Noise and heat have their own findings, measurement context, and HSE review statuses. |
| D-11 | Analysis results are saved and can feed session, daily, and weekly views. |
| D-12 | The complete delivered workflow ends with an HSE-readable assessment and recorded review in the dashboard. |

## 3. Goals and evidence of success

### 3.1 Product goals

- Help HSE identify an observed work activity, the exposure associated with it, and the evidence supporting that finding.
- Make the duration, recurrence, and observation coverage of posture exposure visible.
- Support review of an AI-assisted REBA assessment.
- Present noise and heat measurements in the context of the worker, station, and time covered.
- Translate findings into practical interventions that HSE can edit and approve.
- Preserve results so repeated observations can be compared across days.

### 3.2 Hackathon completion criteria

1. A team-provided video plays in the application.
2. Starting analysis runs a real visual inference pipeline on the chosen segment.
3. The output contains at least one supported posture or movement measurement with timestamps and a data-quality indication.
4. HSE can inspect and complete the REBA inputs for at least one assessable task phase.
5. Temperature and noise fixtures appear with their measurement type, scope, time, and Simulated badge.
6. The assessment contains posture severity, duration metrics, cumulative exposure points when computable, and proposed interventions.
7. The result survives a page refresh and can contribute to daily and weekly summaries.
8. HSE can save a review decision with the associated assessment version.

## 4. Users and responsibilities

| Participant | Responsibility in the prototype |
| --- | --- |
| HSE officer | Selects the video, confirms the subject and task, reviews evidence, completes task context, validates assessment inputs, and records interventions. |
| Demo team | Supplies video assets, completes the footage review, configures supported models, prepares sensor fixtures, and validates expected outputs. |
| Worker represented in the video | Provides the subject of the assessment through the team's approved demo footage and assigned worker identifier. |

The MVP uses one HSE demo role. Worker records can use pseudonymous identifiers. Individual findings are accessible through the HSE company interface.

## 5. Video qualification and scope confirmation

The PRD defines the workflow and analysis contract now. The team completes a Video Suitability Record before committing to exact detection targets. A packing station, a particular body movement, and a particular worker count are examples until confirmed from the footage.

### 5.1 Required Video Suitability Record

| Field | What the team records |
| --- | --- |
| Video identity | Filename, content hash, duration, dimensions, frame rate, rotation, and codec |
| Work context | Actual task name and station or area label |
| People in view | Number of workers, occlusion, crossings, and the method of associating findings with the target worker |
| Camera geometry | View direction, camera movement, visibility of a usable upright reference, and relevant body landmarks |
| Visible activities | Observable motions and task phases that can be annotated consistently |
| Scoring feasibility | Visually estimable REBA inputs and the manual inputs HSE must provide |
| Demo segment | Start and end timestamps selected for a reliable demonstration |
| Reference findings | Manually reviewed timestamps and expected observations for verification |
| Runtime | Measured processing time on the actual demo machine |
| Enabled modules | The posture and movement modules supported by the reviewed footage |

### 5.2 Activation rules

- Enable a posture module when the required landmarks and camera geometry support a usable estimate.
- Choose a subject association method from the footage. Options include one clearly visible target, HSE selection of a region, or a tested tracking method.
- Store the parent task name supplied by HSE alongside the AI-observed movements. The task label and the observation both retain their origin.
- Use Unknown or Unobservable for intervals whose relevant evidence is obscured or ambiguous.
- A complete REBA assessment requires the necessary posture, load, coupling, and activity inputs. HSE can supply or confirm those inputs with their origin recorded.
- If the proposed footage lacks the evidence needed for the planned demonstration, qualification selects another suitable segment or another team-provided clip before model integration is finalized.

### 5.3 Video-dependent items awaiting review

| Item | Current specification |
| --- | --- |
| Primary activity | To be confirmed from team footage |
| Primary body region | To be confirmed from observable posture evidence |
| Number of analyzed subjects | To be confirmed from target selection and attribution feasibility |
| Camera or clip aliases | To be supplied by the team |
| Supported demo duration | To be measured on the demo machine |
| Final reference timestamps | To be annotated after footage review |

## 6. Candidate health concerns and analysis methods

These are candidate modules. The Video Suitability Record determines which visual modules are enabled for the demonstration.

| Health concern | Relevant observable exposure | Additional HSE input | Appropriate assessment direction |
| --- | --- | --- | --- |
| Low-back musculoskeletal complaints | Trunk inclination, reaching, bending episodes, and static holds | Handling load, force, task context, support, and visible twisting uncertainty | REBA-assisted review and posture-duration tracking |
| Shoulder disorders | Upper-arm elevation, elevated reaches, and sustained arm positions | Load, support, effort, and activity context | REBA-assisted review and posture-duration tracking |
| Neck and upper-back discomfort | Head or neck inclination and sustained inspection posture | Viewing task, support, and confirmation of an appropriate reference | REBA-assisted review and posture-duration tracking |
| Carpal tunnel syndrome-related exposure | Repetitive hand exertions and observable wrist position | Force or effort estimate, exertion duration, frequency, and daily task duration | A dedicated hand and wrist method such as the Revised Strain Index, activated when these inputs are available |
| Elbow tendinopathy-related exposure | Repeated tool cycles and forearm rotation | Force, grip, tool use, and task duration | A dedicated upper-extremity exposure assessment |
| Noise-induced hearing loss prevention | Instrument-reported noise exposure over time | Measurement scope, device settings, calibration context, and covered duration | A noise exposure assessment with occupational health follow-up when appropriate |

Shoulder elevation, force, repetition, and related task demands are supported concerns in occupational MSD research. CTS assessment particularly benefits from force and repetition information. The Revised Strain Index incorporates force, frequency, exertion duration, wrist posture, and daily task duration. [S2] [S3] [S4]

## 7. MVP feature priorities

| ID | Feature | Priority | Completion condition |
| --- | --- | --- | --- |
| FR-01 | HSE company dashboard | P0 | HSE can navigate to an analysis and inspect saved findings. |
| FR-02 | Select or import a supplied video | P0 | The chosen asset plays and its metadata is captured. |
| FR-03 | Select a segment and associate a subject | P0 | A valid time range, task, station, and worker association are saved. |
| FR-04 | Run visual analysis | P0 | The enabled model processes frames from that segment. |
| FR-05 | Estimate supported posture and movement | P0 | The output contains timestamped observations with quality metadata. |
| FR-06 | Track duration and static holds | P0 | Metrics use video time and visible intervals. |
| FR-07 | APD detection | Out of scope | Removed from this build by product decision; no detector, UI, or acceptance requirement. |
| FR-08 | Complete a REBA worksheet | P0 | HSE can inspect, supply, and confirm required inputs. |
| FR-09 | Calculate cumulative exposure | P0 | The calculation exposes durations, weights, rules, and coverage. |
| FR-10 | Attach simulated instrument records | P0 | Worker or area readings are time-aligned and labeled Simulated. |
| FR-11 | Show findings and interventions | P0 | Every recommendation has a finding, rationale, and review state. |
| FR-12 | Save and review an assessment | P0 | A persisted version records the HSE decision. |
| FR-13 | Aggregate daily and weekly observations | P0 | Summaries use saved sessions and show coverage and provenance. |
| FR-14 | Rich charts and body-region visuals | P1 | Additional visuals use the same saved metrics. |
| FR-15 | Conditional exposure projections | P1 | Assumptions and projected values are visible separately from observed totals. |
| FR-16 | Additional posture or hand-task modules | P1 | Each module passes its own video and input qualification. |

P0 defines the hackathon result. Implementation should first complete one qualified video through analysis, review, and persistence, then extend the same data to the overview and trend views.

## 8. HSE product flow

### 8.1 Select a work session

HSE chooses a team-provided video or imports a supported file, previews it, selects the segment, and confirms the target worker, task, station, and shift. The application presents the enabled modules supported by that video. HSE selects the appropriate simulation fixture for the session.

### 8.2 Analyze

HSE starts the job and sees its progress. The system extracts the selected frames, obtains visual observations, builds timed exposure episodes, attaches matching instrument records, and calculates available metrics. Any required manual assessment inputs appear as fields to complete.

### 8.3 Inspect the result

HSE sees a summary of findings, observed coverage, raw measurements, draft risk bands, and recommendations. Clicking a visual finding seeks the player to its timestamp. Expanding a score reveals the associated worksheet inputs and cumulative calculation.

### 8.4 Complete and validate

HSE confirms or edits the subject association, score inputs, finding interpretation, and intervention. A complete reviewed assessment records the reviewer, time, rule version, and rationale. An assessment needing additional information remains available with its missing inputs identified.

### 8.5 Review trends

HSE opens saved session, daily, or weekly views and compares observations from compatible tasks. The dashboard shows valid observation time, sampled shifts, recurring findings, and HSE review status alongside the trends.

## 9. Input contract

### 9.1 Shared session metadata

Every analysis requires a session identifier, video identifier, selected time range, station, task, shift, target worker association, and site timezone. The application stores an actual session start timestamp or an explicit offset mapping between the video and the fixture timeline.

Use half-open intervals, `[start, end)`, throughout time calculations. Keep internal timestamps in UTC where available and render dates in the configured site timezone. For this build, the assumed daily shift is 08:00–17:00 Asia/Jakarta on the selected session date. Use that local date for the daily grouping. Scheduled duration is nine hours; observed video coverage remains a separate measured quantity. Recording outside this assumed shift and overlapping-recording resolution remain deferred.

### 9.2 Visual input

The video importer records duration, frame rate, resolution, codec, rotation, and a content hash. The player and frame extractor must agree on the selected time interval. The final supported encoding and processing duration are confirmed from the supplied footage on the demo machine.

### 9.3 Task and REBA context

HSE can provide task-specific load or force, shock or sudden force application, grip or coupling quality, support, assessed body side, relevant posture adjustments, and activity factors. Every entered field records its origin as visual estimate, HSE input, or task template.

### 9.4 Simulated heat data

| Field | Requirement |
| --- | --- |
| `worker_id` | Required for a worker body-temperature record |
| `station_id` | Required for room-condition records |
| `timestamp` or interval | Required for association with the session |
| `body_temperature_c` | Optional simulated instrument value in degrees Celsius |
| `body_temperature_type` | Required when a body-temperature value is supplied, using a declared method such as core, tympanic, forehead, skin, or unspecified |
| `air_temperature_c` | Optional simulated room-air temperature |
| `relative_humidity_pct` | Optional simulated humidity in the range 0 to 100 |
| `instrument_id` | Identifier of the assumed instrument in the fixture |
| `source` | `simulated` for hackathon heat inputs |
| `profile_id` | Review profile used to interpret the reading, if configured |

The fixture represents the data an instrument would supply. Body-temperature type remains attached to the value through every calculation and report. Core temperature, heart rate, and related physiological measurements can form part of heat-strain monitoring in an appropriate occupational health protocol. [S5]

### 9.5 Simulated noise data

| Field | Requirement |
| --- | --- |
| `scope` | `personal` or `area` |
| `worker_id` | Required for a personal record |
| `station_id` | Required for an area record |
| `start` and `end` | Required measurement interval |
| `level_dba` | A-weighted level for the declared interval model |
| `interval_model` | `constant_simulated` for the default demo dose calculation, or an explicitly described instrument output |
| `instrument_id` | Identifier of the assumed instrument |
| `profile_id` | Criterion level, duration, exchange rate, and threshold settings |
| `source` | `simulated` for hackathon noise inputs |

Personal dosimeters are appropriate for individual noise assessment. Area readings provide workstation context. The report preserves that scope. [S6]

## 10. Visual analysis requirements

### 10.1 Pose and posture

- Extract the relevant body landmarks using a tested pose model.
- Estimate only angles supported by the camera view, visible landmarks, and calibration or reference information.
- Correct image-coordinate scaling when calculating angles from image coordinates.
- Record the estimated angle, body region, interval, landmark visibility, and model version.
- Keep low-quality or occluded intervals explicit in the timeline.
- Associate a posture with a reviewed task phase so the REBA context can be inspected.

MediaPipe Pose Landmarker is a candidate implementation. Its landmark and visibility outputs can support this pipeline. The video qualification and demo runtime determine the final model choice. [S7]

### 10.2 Activity and movement segments

The initial system can use pose and motion rules for observable segments such as trunk inclination, arm elevation, stable posture, posture change, or an unknown interval. The actual supported movement labels are set from the supplied footage. Specific job names come from HSE context unless a tested activity classifier supports them.

### 10.3 Timing and sampling

Calculate duration from video timestamps. Sampling frequency is selected to match the motions being measured and verified against annotated footage. Fast repetition requires sufficient temporal resolution. A posture measurement and a repetition count can have different usable coverage.

Smooth short landmark fluctuations conservatively. Store the smoothing and event-merging settings with the rule version. Occlusion interrupts continuous observed holding time and remains visible as an evidence gap. A gap supplies neither confirmed continuation nor confirmed recovery.

## 11. Reviewed REBA assessment

### 11.1 Calculation

Use the published worksheet and its lookups. [S8]

```text
A = Table A(trunk, neck, legs) + load/force adjustment
B = Table B(upper arm, lower arm, wrist) + coupling adjustment
C = Table C(A, B)
R = C + applicable REBA activity adjustments
```

Store the categorical inputs, assessed side, adjustments, A, B, C, activity adjustment, final R, selected timestamp, and HSE review state. Keep the result partial until the required inputs are complete. Invalid input combinations produce a validation message.

The selected final score ranges from 1 to 15. The Table C subtotal used by the cumulative prototype ranges from 1 to 12. Each worksheet represents a selected posture or task phase. The assessment exposes which phase and timestamp it describes.

### 11.2 Dashboard bands and action levels

| Final REBA R | Dashboard band | Published category retained in details | HSE action direction |
| --- | --- | --- | --- |
| 1 | Low | Negligible | Routine observation |
| 2–3 | Low | Low | Consider improvements and review concerns |
| 4–7 | Medium | Medium | Assign improvement and reassessment |
| 8–10 | High | High | Prioritize corrective action soon |
| 11–15 | High, with Immediate action badge | Very high | Use the site's immediate-action procedure after confirmation |

These bands group the published REBA action levels for the interface. The original score and action level remain inspectable. [S8]

### 11.3 Session and period summaries

Show the highest reviewed score among the sampled, assessed phases with its task and timestamp. Display its observation coverage. Keep partial phases visible as pending inputs. A period summary carries the underlying reviewed findings forward, including any confirmed high-priority finding.

## 12. ISO 11226-inspired holding-time tracking

ISO 11226 considers body angles and time when evaluating static working postures involving little or no external force. The prototype uses that concept to organize observed posture episodes and holding time. [S9]

For each supported region and posture band, the configuration records the angle condition, acceptable tracking quality, stability criteria, support context, and an optional HSE-reviewed holding trigger. A continuous episode starts when the observed posture qualifies and ends when it changes or usable visibility is lost. An episode is one observed time interval, not a separate scoring method: for example, trunk inclination from video second 10 to second 25 is a 15-second episode. REBA supplies the linked phase severity; this tracking module supplies the episode duration used in the combined HEALY calculation.

The output includes total flagged posture time, longest continuous observed hold, number of episodes, number of holds crossing the configured trigger, and observed neutral or supported intervals when visible. Repeated short movements have their own episodes and repetition metrics.

The holding trigger depends on posture and task context. The 30-second value in the numerical example is a demo parameter. The interface labels this module ISO 11226-inspired screening and stores the rule version used.

## 13. HEALY cumulative exposure points

### 13.1 Intended use

This is a proposed HEALY prototype metric for ranking and comparing observed exposure within compatible tasks and rule profiles. Its weights and extra time term are product choices to be evaluated against expert assessments. HSE approval records review of the report. Scientific validation of the metric requires a separate evaluation.

### 13.2 Episode calculation

Let each i be a nonoverlapping flagged episode for the selected subject, task phase, and body-region analysis.

| Symbol | Meaning |
| --- | --- |
| `C_i` | Reviewed Table C subtotal for the associated task phase |
| `d_i` | Observed flagged duration in minutes |
| `H_i` | Configured holding trigger in minutes, where an eligible static-hold rule exists |
| `e_i` | Observed minutes beyond that trigger for an eligible static hold |
| `w_i` | Prototype severity weight |

```text
w_i = 1 when C_i is 1–3
w_i = 2 when C_i is 4–7
w_i = 3 when C_i is 8–12

e_i = max(0, d_i - H_i) for an eligible, observable static hold
e_i = 0 for ordinary short or dynamic flagged episodes

Exposure points = sum(w_i × (d_i + e_i))
Points per observed hour = Exposure points / usable assessment hours
```

The extra term applies when the static rule has the required posture, force, support, and measurement context. When the hold rule is pending, show the base observed exposure and mark the extra-hold component Pending. Required score inputs must be complete for the reviewed numeric result.

Use the Table C subtotal as the severity input to the points calculation. The final REBA activity adjustment is applied once within the REBA worksheet. The cumulative view exposes its own time terms independently.

Maintain a timeline per configured region. For concurrent detections of the same region, merge or resolve overlapping episodes before calculating points. Report separate regional analyses rather than accumulating duplicate minutes across simultaneous detections.

### 13.3 Numerical example

This example explains the calculation. The team's actual footage determines the demonstration activity.

- Recorded sample duration is 40 minutes.
- Usable posture observation is 30 minutes.
- Flagged posture totals 12 minutes, or 40% of usable posture time.
- Eight static holds last 45 seconds each, contributing 6 of those flagged minutes.
- The remaining flagged episodes contribute another 6 minutes.
- A 30-second demo trigger gives `8 × 15 seconds = 2 minutes` beyond the trigger.
- Reviewed `C = 5`, so the prototype weight is 2.
- Exposure points are `2 × (12 + 2) = 28`.
- Points per observed hour are `28 / 0.5 = 56`.

The REBA category comes from the final worksheet score R. The 28 points describe observed cumulative exposure under this prototype configuration.

### 13.4 Review priority

Use the reviewed REBA bands as the default ergonomic action direction. Add a visible Follow-up flag when an eligible holding rule is crossed or a configured recurrence rule is met. HSE can elevate review priority with a recorded rationale while retaining the original score.

An optional demo recurrence rule can flag the same posture pattern appearing in at least three distinct monitored shifts. This is a workflow setting with a Demo rule label. The dashboard displays the observed count and denominator. Numeric exposure-point thresholds require task-specific calibration before they drive additional automatic priority levels.

## 14. Noise assessment

### 14.1 Personal and area scope

For the default demo, fixtures can represent a personal dosimeter associated with the selected worker. Area fixtures remain associated with their station. The output labels the measurement scope and covered duration. Personal records attach by worker and time. Area records attach by station and time.

### 14.2 Example dose profile

The optional prototype dose calculator uses a named NIOSH-style profile with an 85 dBA criterion, eight-hour criterion duration, three-dB exchange rate, and 80 dBA integration threshold. Instrument settings and profile are shown in the report. NIOSH describes this criterion and the dose calculation. [S6] [S10]

For constant simulated windows at eligible levels, with time in hours, use the following.

```text
Reference duration T(L) = 8 × 2^((85 - L) / 3)
Covered dose percent = 100 × sum(observed duration_i / T(level_i))
```

For example, 40 minutes at a constant simulated 88 dBA contributes `100 × (40 / 240) = 16.7%` under that profile. Label this Dose contribution for 40 covered minutes. Keep the unmeasured portion of the shift visible as missing coverage.

Use explicit instrument-reported dose when available with compatible settings. Coarse averages and area measurements retain their stated scope. Aggregating sound levels uses the energy scale and the declared averaging windows. [S11]

### 14.3 Noise output and actions

Show the level, interval, personal or area scope, criterion profile, measurement coverage, any computable dose contribution, and review status. Suggested statuses include Readings available, Partial shift coverage, Personal assessment needed, and Selected criterion reached. A confirmed result reaching the selected criterion prompts HSE review of noise controls and the relevant hearing-conservation process.

HSE can investigate the source, review maintenance or isolation options, confirm protective equipment, and arrange occupational health follow-up. Audiometry and clinical assessment support evaluation of hearing concerns. [S6] [S12]

Indonesian reference context is available in Permenaker No. 5/2018, which includes exposure-duration tables for noise and ISBB values by workload and work-rest pattern. The selected calculation profile and legal applicability remain explicit in each deployment. [S13]

## 15. Heat assessment

The fixture supplies simulated body-temperature and room-condition measurements as if they arrived from instruments. Compute available sample counts, time coverage, values or ranges, and changes across actual fixture timestamps. Keep each reading's measurement type and subject or station attached.

The default MVP status is Readings available, HSE assessment pending. HSE can record a reviewed status such as Monitor, Further assessment required, or Priority follow-up with a rationale. An optional automatic screening profile must specify its measurement types, rules, provenance, and intended context. Any demo-only trigger carries a Demo rule label.

Body-temperature type is necessary context for interpretation. Room-air temperature, humidity, and worker activity describe parts of the exposure context. A full workplace heat assessment can consider WBGT or ISBB, workload, clothing, acclimatization, and work-rest conditions. [S5] [S14]

If a body-temperature method or rule profile is unspecified, the dashboard lists the reading and the missing context. Simulated provenance remains visible after HSE review.

## 16. Metrics and calculation definitions

| Metric | Unit | Definition and display requirement |
| --- | --- | --- |
| Selected sample duration | Seconds or minutes | Union of the selected source intervals |
| Usable posture time | Seconds or minutes | Intervals meeting the relevant posture module's visibility and quality criteria |
| Posture coverage | Percent | Usable posture time divided by selected sample duration |
| Shift observation coverage | Percent | Usable observation time divided by declared expected observation time, shown only when the latter is known |
| Flagged posture duration | Seconds or minutes | Union of observed flagged episodes for the specified region and rule |
| Flagged posture share | Percent | Flagged posture duration divided by usable posture time |
| Longest observed hold | Seconds | Longest uninterrupted observable qualifying episode |
| Episode count | Count | Number of qualifying episodes under the recorded segmentation rule |
| Repetition frequency | Per minute | Supported repeated cycles divided by valid observation duration for that module |
| Reviewed REBA | 1–15 | Complete worksheet score for the linked phase and timestamp |
| REBA band | Label | Low, Medium, or High, with original action level in details |
| Cumulative exposure | Prototype points | Episode calculation from Section 13 |
| Exposure rate | Points per observed hour | Points divided by usable assessment hours |
| Recurring shifts | Count and denominator | Distinct observed shifts containing the specified finding, over distinct usable monitored shifts |
| Noise level | dBA | Level with its scope and averaging or constant interval model |
| Covered noise dose | Percent | Dose contribution under the named compatible profile, with duration coverage |
| Temperature | Degrees Celsius | Instrument reading with measurement type and timestamp |
| Humidity | Percent | Instrument reading with timestamp |
| Review status | Label | Workflow state and reviewer metadata |

Every metric includes its unit, interval, source, rule or model version, and relevant quality status. Zero observed exposure and missing evidence remain distinct data states.

## 17. Daily, weekly, and projection views

### 17.1 Observed daily summary

Aggregate actual saved intervals by the session date of the assumed 08:00–17:00 Asia/Jakarta shift. Display sampled and usable time, flagged duration, longest hold, complete reviewed REBA findings, exposure points, sensor coverage, and HSE review state. A short sample produces a sample-based daily record whose coverage is prominent.

### 17.2 Observed weekly summary

Sum unique exposure points and usable time. Calculate the weekly exposure rate from these totals. For example, 72 points across 90 usable minutes gives 48 points per observed hour. Count recurring findings by distinct shift. Show the number of shifts with usable data and any known expected shifts.

Keep daily noise dose results as daily results with their own criteria and coverage. A weekly noise view can show the days covered and the count of days reaching the selected criterion.

### 17.3 Seeded history and projections

Seeded demo history has a visible origin label and its own timestamps and session identifiers. A real video analysis result retains its actual visual provenance even when attached to simulated environmental inputs.

An optional projection can multiply an observed posture share by explicitly entered comparable task hours. Present the assumptions and projected quantities in a separate view. Month views use the same aggregation rules when enough sessions exist.

## 18. Dashboard and report format

### 18.1 Navigation

The compact interface has Company overview, Analyze video, and Analysis history. A session result opens its evidence player and HSE review panel. A worker profile can be a drawer within the HSE interface showing that worker's saved exposure history.

### 18.2 Company overview

Show date and station filters, analyzed workers and sessions, usable observation time, reviewed findings by band, pending assessments, recurring task findings, and time-series summaries. Every count distinguishes the reviewed population and the coverage behind it.

### 18.3 Analysis workspace

Show video playback, selected range, subject and task association, active modules, sensor fixture selection, required task inputs, Analyze, and job progress. Preserve the selected video context while the job runs.

### 18.4 Session report layout

1. Report header with worker, task, station, shift, timestamps, review state, and version.
2. Coverage summary showing recorded time, usable time, and source labels.
3. Findings with risk band or review status, evidence, and rationale.
4. Clickable timeline and video evidence.
5. REBA worksheet details and cumulative point breakdown.
6. Heat and noise context with independent statuses.
7. Suggested intervention, HSE edits, action owner, and reassessment note.
8. HSE review decision and version history.

### 18.5 Illustrative report

**Worker DEMO-014 · Task A · Station A · Shift A · Draft awaiting HSE validation**

**Selected video sample is 40 minutes. Usable posture time is 30 minutes, giving 75% sample coverage. Environmental readings are Simulated.**

| Finding | Evidence | Proposed follow-up |
| --- | --- | --- |
| Ergonomics, proposed Medium | Candidate REBA 5 from the completed task worksheet. Flagged posture totals 12 of 30 usable minutes. Longest observed hold is 45 seconds. | HSE checks the worksheet and relevant workstation condition. |
| Recurring exposure | 28 prototype points today and 56 points per observed hour. A weekly example contains 72 points across 90 usable minutes and three sampled shifts. | Review the recurring task and assign a reassessment. |
| Personal noise, partial coverage | Constant simulated 88 dBA over 40 covered minutes gives a 16.7% contribution under the selected 85/3 profile. | HSE reviews the coverage and selected noise criterion. |
| Heat, assessment pending | Simulated air temperature 32 degrees Celsius, humidity 72%, and body-temperature samples with the declared measurement type. | HSE reviews the readings and measurement context. |

This report is an illustrative output format. Actual activities, score inputs, values, and timestamps come from the selected video and fixture.

### 18.6 HSE review controls

Provide Edit inputs, Request more evidence, and Approve assessment. An edit affecting calculations creates a new assessment version and recalculates dependent metrics. The earlier reviewed version remains in history. The final review records the HSE name or demo identifier, time, rationale, and approved version.

Approval requires complete inputs for each numeric assessment presented as reviewed. Supplemental heat or noise findings can retain an explicit Pending status in the approved report. HSE records the remaining context and observation coverage in the review rationale.

## 19. Intervention requirements

Every suggestion references a finding, the evidence behind it, an action direction, an owner, and a reassessment method. HSE can edit each suggestion.

| Finding | Suggested intervention direction | Reassessment evidence |
| --- | --- | --- |
| Low reviewed ergonomic band | Routine observation and practical setup improvements where useful | Subsequent comparable task observations and worker concerns supplied to HSE |
| Medium reviewed ergonomic band | Assign a task or workstation improvement, such as adjusting reach distance, material position, support, or handling method when relevant | Posture time and reviewed worksheet for the same task after the change |
| High, REBA 8–10 | Prioritize HSE review and corrective action soon | Documented control and reassessment |
| High, REBA 11–15 | Apply the site's immediate-action process after HSE confirmation | HSE confirmation of control and the next task assessment |
| Recurring or sustained exposure | Investigate why the posture repeats or remains held and review possible task variation or workstation changes | Recurrence, holding-time, and exposure-rate comparison |
| Noise finding | Investigate the source, consider engineering controls, and review the relevant hearing-conservation process | Compatible follow-up noise measurements and occupational health evaluation as appropriate |
| Heat finding | Review environmental and physiological measurement context and the applicable heat procedure | Appropriate subsequent measurements and HSE or occupational health review |

Engineering and task-design controls should be considered early in ergonomic interventions. NIOSH's hierarchy of controls supports prioritizing changes to the work and equipment. [S15]

## 20. Data model

| Entity | Core fields |
| --- | --- |
| `Worker` | ID, demo display name, optional assigned station |
| `Station` | ID, name, timezone and task profiles |
| `Shift` | ID, worker association, start, end, expected observation duration when known |
| `VideoAsset` | ID, path, content hash, duration, encoding metadata, qualification record |
| `AnalysisSession` | ID, video, selected intervals, subject association, worker, station, task, shift, fixture, job state |
| `Observation` | Session, body region, start, end, observed values, quality, model version |
| `TaskAssessment` | Session, phase, timestamp, REBA inputs and origin, A, B, C, activity, R, completion state |
| `ExposureEpisode` | Subject, region, phase, start, end, stability, holding rule, evidence references |
| `SensorRecord` | Scope, worker or station, time, quantity, value, unit, measurement type, source, instrument and profile |
| `RuleProfile` | ID, version, purpose, parameters, provenance, demo flag |
| `Finding` | Session or period, type, metrics, reason, evidence references, proposed band or review flag |
| `AssessmentVersion` | Session, inputs snapshot, calculated results, model and rule versions, provenance |
| `HSEReview` | Assessment version, reviewer, decision, rationale, time |
| `Intervention` | Finding, proposed action, HSE edit, owner, status, reassessment note |

Store missing values as missing with a reason. Preserve the distinction between zero, unobserved, partial, simulated, and HSE-confirmed.

## 21. State, persistence, and repeat analysis

Analysis jobs use Queued, Processing, Completed, and Failed states. A Failed job retains the source, selected range, and error context so HSE can retry. A result is published when its required artifacts are consistently saved.

Assessment review uses Draft, Needs evidence, and Approved states. Approval is associated with a particular version. Recalculating inputs produces a new draft version.

Cache reusable visual inference using the video content hash, selected interval, subject association, exact model artifact and inference configuration, and visual-rule versions. Assessment calculations are separate: snapshot the worker, station, task and phase context, shift and session date, video-to-fixture time mapping, fixture ID and version, HSE inputs, and assessment-rule versions. A change to any calculation input creates a new draft assessment version, while compatible cached visual observations may be reused. Preserve earlier reviewed versions and their reviews.

Dashboard selection between a previous approved version and a new draft is pending product discussion. The overlap policy for multiple recordings is also deferred. The route-only slice returns empty summaries and implements neither unresolved policy; later aggregation must count each eligible source interval once.

Preserve sensor provenance in each derived result. HSE review does not change the Simulated origin of a fixture.

## 22. Implementation guidance

### 22.1 Suggested stack

| Layer | Suggested implementation |
| --- | --- |
| Web UI | Next.js, TypeScript, Tailwind, HTML5 video, and a chart library |
| Analysis service | Python with FastAPI and background processing |
| Video handling | OpenCV or a tested decoder compatible with the supplied files |
| Pose | MediaPipe Pose Landmarker or a qualified equivalent |
| Assessment | Deterministic worksheet and exposure rules with visible versions |
| Persistence | SQLite and local video and result storage for the hackathon |
| Sensor fixtures | JSON or CSV records imported through the same normalized data contract |

These choices are implementation recommendations. Video compatibility and runtime are confirmed on the team's machine during qualification.

### 22.2 Processing sequence

1. Validate video and selected range.
2. Resolve subject, task, station, shift, and fixture association.
3. Decode frames and run enabled models.
4. Derive quality intervals, supported angles, and movement segments.
5. Construct timestamped exposure episodes.
6. Attach relevant fixture windows by subject or station and time.
7. Build the candidate worksheet and identify required manual inputs.
8. Calculate available exposure, noise, and heat summaries.
9. Save one consistent assessment version and its evidence references.
10. Display the report and accept HSE review.

### 22.3 Minimal service contract

| Operation | Example endpoint | Expected result |
| --- | --- | --- |
| Read service health | `GET /health` | Service availability |
| Read prototype configuration | `GET /config` | Site timezone, assumed shift, analysis availability, and disabled modules |
| List or register videos | `GET/POST /videos` | Asset metadata and qualification context |
| Start analysis | `POST /analysis-sessions` | Session and job ID |
| Read progress | `GET /analysis-sessions/{id}` | State, progress, and error or completion context |
| Read assessment | `GET /analysis-sessions/{id}/assessment` | Metrics, evidence, input completeness, versions, and findings |
| Update assessment inputs | `PATCH /analysis-sessions/{id}/assessment` | Recalculated draft version |
| Save HSE review | `POST /assessment-versions/{id}/reviews` | Reviewed version and decision |
| Read history | `GET /analysis-sessions` | Filtered saved sessions |
| Read summary | `GET /dashboard?from=...&to=...` | Coverage-aware daily or weekly aggregation |

The frontend can use an equivalent local service contract when the chosen implementation preserves these behaviors.

During the route-only slice, list endpoints return empty `items`, the dashboard returns empty totals, and unknown session or assessment IDs return 404. Video registration, assessment editing, and review saving return 501 until implemented. A valid analysis request returns 503 while the pipeline is unavailable; malformed input returns 422. These responses are availability contracts, not completed prototype features. API documentation is available at `/docs`.

## 23. Example simulation fixture

This example represents assumed instruments. It demonstrates structure and provenance. The body-temperature method must be chosen deliberately when preparing the demo fixture.

```json
{
  "fixture_id": "demo-sensors-01",
  "version": 1,
  "source": "simulated",
  "time_basis": "seconds_from_session_start",
  "noise_profile_id": "niosh_rel_85_3_demo",
  "noise_records": [
    {
      "worker_id": "DEMO-014",
      "scope": "personal",
      "start_s": 0,
      "end_s": 2400,
      "level_dba": 88,
      "interval_model": "constant_simulated",
      "instrument_id": "assumed-personal-dosimeter-01",
      "source": "simulated"
    }
  ],
  "room_records": [
    {
      "station_id": "STATION-A",
      "start_s": 0,
      "end_s": 2400,
      "air_temperature_c": 32,
      "relative_humidity_pct": 72,
      "instrument_id": "assumed-room-sensor-01",
      "source": "simulated"
    }
  ],
  "body_records": [
    {
      "worker_id": "DEMO-014",
      "timestamp_s": 0,
      "body_temperature_c": 37.3,
      "body_temperature_type": "core",
      "instrument_id": "assumed-body-sensor-01",
      "source": "simulated"
    },
    {
      "worker_id": "DEMO-014",
      "timestamp_s": 1200,
      "body_temperature_c": 37.4,
      "body_temperature_type": "core",
      "instrument_id": "assumed-body-sensor-01",
      "source": "simulated"
    }
  ]
}
```

The sample uses core as an illustrative assumed device method. Its two body-temperature records are discrete samples. Report their values and timestamps, and show temperature coverage according to the configured sampling context. Keep missing intervals explicit. Fixtures used for the actual demo are aligned to the supplied video's selected duration.

## 24. Error handling and quality requirements

| Condition | Required behavior |
| --- | --- |
| Unsupported or damaged video | Explain the format or decoding problem and retain the selected session context. |
| Invalid time range | Identify the invalid field before analysis starts. |
| Target worker ambiguous | Request an HSE association or show the affected interval as unassigned. |
| Relevant landmarks obscured | Mark the interval Unknown and update module coverage. |
| Required REBA input missing | Display a partial worksheet and the fields needed. |
| Fixture belongs to another worker or station | Leave it unmatched and identify the association issue. |
| Fixture time coverage incomplete | Show covered and missing windows. |
| Body-temperature type unspecified | Show the value with measurement context pending. |
| Noise profile incomplete | Show the reading and identify missing dose-calculation context. |
| Job failure | Retain a retryable job and a clear failure message. |
| Repeated analysis | Retain revisions and aggregate the selected active version once. |
| Input edit after HSE review | Create a new draft calculation version and retain prior review history. |

Use a progress indicator while processing. Show recorded runtime and a rehearsed demo segment rather than making an unverified throughput promise. Use readable units and plain descriptions alongside technical scores.

## 25. Acceptance criteria

| ID | Scenario | Acceptance |
| --- | --- | --- |
| AC-01 | Select a supplied video | The correct video plays and saved metadata matches the selected asset. |
| AC-02 | Select a segment | Only the chosen time range contributes to the result. |
| AC-03 | Confirm a subject | Findings retain the operator-confirmed worker association and selection context. |
| AC-04 | Run real inference | A supported observation can be traced to the analyzed frame or interval. |
| AC-05 | Inspect evidence | Selecting a finding seeks the player to the correct timestamp. |
| AC-06 | Measure a known episode | Start, end, and duration agree with a manually annotated reference within the declared tolerance. |
| AC-07 | Encounter occlusion | The gap is visible and continuous observed holding time ends. |
| AC-08 | APD scope exclusion | No APD detection is required or presented as an analysis result in this build. |
| AC-09 | Complete a REBA worksheet | Required manual fields are visible and the correct lookup is used. |
| AC-10 | Verify a worksheet example | A verified A=6, B=5 example gives C=8. One applicable activity adjustment gives R=9, High. |
| AC-11 | Preserve urgent REBA action | R=11–15 shows the Immediate action badge. |
| AC-12 | Verify cumulative arithmetic | The Section 13 example gives 28 points and 56 points per observed hour. |
| AC-13 | Attach fixture data | Only matching worker or station and time records contribute. |
| AC-14 | Preserve simulation provenance | Heat and noise remain labeled Simulated in both draft and approved views. |
| AC-15 | Verify personal noise arithmetic | Forty constant simulated minutes at 88 dBA gives a 16.7% covered contribution under the declared 85/3 profile. |
| AC-16 | Read area noise | The reading retains Area scope and its actual measurement window. |
| AC-17 | Read body temperature | Value, method, timestamp, instrument context, and simulated origin are present. |
| AC-18 | Save and refresh | Session, evidence references, and review status survive a page reload. |
| AC-19 | Aggregate periods | Daily and weekly totals use unique intervals and the active version. |
| AC-20 | Verify weekly rate | Seventy-two points over 90 usable minutes gives 48 points per observed hour. |
| AC-21 | Review a report | Approval stores the HSE identity, time, rationale, and version. |
| AC-22 | Revise an approved input | A new draft version is created with updated calculations. |
| AC-23 | Handle incomplete evidence | Missing observations remain identifiable and the report exposes what supports its score. |
| AC-24 | Complete the demonstration | The selected footage produces a readable assessment on the actual demo machine within the rehearsed demonstration flow. |

## 26. Verification and pilot metrics

For the hackathon, annotate a small set of actual video intervals and use them to check posture detection, episode timing, and target association. Check the worksheet and cumulative arithmetic against fixed reference cases. Validate timestamps, units, source labels, and aggregation using the simulation fixtures.

Record processing time, usable coverage, duration error against annotations, agreement with HSE-reviewed worksheet examples. Additional model performance reporting depends on the amount of labeled footage available.

A future pilot can measure early concerns reported per monitored worker-week, time to HSE review, completion of preventive follow-up, worker understanding, and changes in observed exposure following an intervention. Reporting outcomes and workplace exposure outcomes should each be evaluated against an appropriate baseline.

## 27. Seven-hour implementation sequence

| Time | Work | Reviewable output |
| --- | --- | --- |
| Hour 1 | Review supplied footage, lock supported modules, confirm runtime and inputs, establish app and data skeleton | Completed Video Suitability Record and working playback |
| Hours 2–3 | Integrate the selected visual model, target association, quality intervals, and duration tracking | Real timestamped visual observations |
| Hour 4 | Add the REBA worksheet, simulated instruments, and rule calculations | Inspectable metrics and calculation inputs |
| Hour 5 | Build the results workspace with evidence seeking, findings, and HSE review | Usable report from the qualified video |
| Hour 6 | Persist versions and add company, daily, and weekly summaries | Saved sessions and coverage-aware trends |
| Hour 7 | Verify reference cases, resolve failures, rehearse the chosen clip, and refine the report | Complete repeatable demonstration |

Prioritize one reliable end-to-end analysis path. Additional modules become useful once their observations can pass through the same evidence, review, and persistence contract.

Use Codex during implementation in line with the hackathon's stated requirement. [S16]

## 28. Assumptions and configuration register

| ID | Assumption or configuration | How it is resolved |
| --- | --- | --- |
| A-01 | Exact video activities and camera characteristics are unknown | Complete Section 5 using the team's footage. |
| A-02 | At least one posture exposure relevant to the selected work task can be observed in a qualified supplied segment | Confirm the relevant posture module during footage review. |
| A-03 | The prototype has one HSE demo role | Seed a demo reviewer and store review identity. |
| A-04 | Subject association can be confirmed by HSE | Choose and test the association method from the footage. |
| A-05 | Heat and noise fixtures represent assumed instrument outputs | Keep source, measurement type, worker or station, and time metadata in every result. |
| A-06 | Example body-temperature records use an assumed core-temperature device | Confirm the actual demo fixture method before applying a review profile. |
| A-07 | The 30-second hold trigger and severity weights are demo settings | Keep them editable, versioned, and labeled as prototype choices. |
| A-08 | The example noise calculator uses the named NIOSH-style 85/3 profile | Show the profile and covered duration in the result. |
| A-09 | Three monitored shifts can trigger a demo recurrence flag | Store the recurrence setting as a workflow rule and show its denominator. |
| A-10 | Temperature review defaults to HSE interpretation of the supplied context | Keep the heat status pending until the reviewer or a declared profile provides a decision. |
| A-11 | Daily and weekly views can combine real visual sessions and visibly seeded history | Preserve source labels and aggregate only eligible active records. |
| A-12 | Optional projections and extra visual modules follow the completed P0 workflow | Add them only after the core acceptance criteria pass. |

## 29. Reference sources

References support the assessment context and source methods. HEALY's prototype weighting, demonstration triggers, and software workflow are design decisions specified in this document.

- [S1] Khoe et al., 2026. Global reporting and underreporting of occupational diseases, a systematic review. [PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0345318).
- [S2] NIOSH. Specific musculoskeletal disorders and occupational risk factors. [Identify Risk Factors](https://www.cdc.gov/niosh/ergonomics/ergo-programs/risk-factors.html).
- [S3] Work-relatedness of carpal tunnel syndrome, systematic review and meta-analysis. [Open-access article](https://pmc.ncbi.nlm.nih.gov/articles/PMC9629628/).
- [S4] Garg, Moore, and Kapellusch. The Revised Strain Index, an improved upper-extremity exposure assessment model. [NIOSH-hosted article](https://stacks.cdc.gov/view/cdc/203365/cdc_203365_DS1.pdf).
- [S5] NIOSH. Criteria for a Recommended Standard, Occupational Exposure to Heat and Hot Environments. [Criteria document](https://www.cdc.gov/niosh/docs/2016-106/pdfs/2016-106.pdf).
- [S6] NIOSH. Personal and area noise measurement, dosimeter settings, and audiometry. [Understand Noise Exposure](https://www.cdc.gov/niosh/noise/prevent/understand.html).
- [S7] Google AI Edge. Pose Landmarker outputs and landmark visibility. [Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker).
- [S8] Cornell Ergonomics. Hignett and McAtamney REBA worksheet and supporting scoring material. [REBA resources](https://www.ergo.human.cornell.edu/ahREBA.html) and [scoring slides](https://ergo.human.cornell.edu/Pub/AHquest/Cornell_REBA.pdf).
- [S9] ISO 11226:2000. Ergonomics, Evaluation of static working postures. [Official standard overview](https://www.iso.org/standard/25573.html).
- [S10] NIOSH. Occupational Noise Exposure, Revised Criteria 1998. [Criteria document](https://www.cdc.gov/niosh/docs/98-126/pdfs/CriteriaDoc_98-126.pdf).
- [S11] Federal Highway Administration. Equivalent sound level and energy-based averaging. [Noise Measurement Handbook](https://www.fhwa.dot.gov/Environment/noise/measurement/handbook.cfm).
- [S12] NIOSH. Noise source controls. [Implement Engineering Controls](https://www.cdc.gov/niosh/noise/prevent/engineering.html).
- [S13] Kementerian Ketenagakerjaan. Permenaker No. 5/2018 on occupational health and safety in the working environment. [Official regulation](https://jdih.kemnaker.go.id/asset/data_puu/Permen_5_2018.pdf).
- [S14] OSHA. Workplace heat factors and WBGT. [Heat Hazard Recognition](https://www.osha.gov/heat-exposure/hazards).
- [S15] NIOSH. Ergonomics intervention hierarchy and controls. [Implement Your Ergonomic Program](https://www.cdc.gov/niosh/ergonomics/ergo-programs/implement.html).
- [S16] Sea and OpenAI. Regional Codex Hackathon Indonesia, development tracks and Codex requirement. [Official event page](https://seaxopenai-hackathon-id.sea.com/).

## 30. Final delivery checklist

- [ ] The actual videos have a completed qualification record.
- [ ] Enabled movement and posture modules match that record.
- [ ] The demonstrated visual findings come from the selected footage.
- [ ] Required HSE inputs and incomplete evidence are visible.
- [ ] REBA action levels, prototype points, and independent sensor statuses are traceable.
- [ ] Heat and noise inputs retain Simulated badges and measurement context.
- [ ] The report states the observed time and any known missing coverage.
- [ ] An HSE officer can inspect the evidence, edit inputs, and record a review.
- [ ] Saved results produce correct daily and weekly summaries.
- [ ] The chosen end-to-end demonstration has been rehearsed on the actual machine.
