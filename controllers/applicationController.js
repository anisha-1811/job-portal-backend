const db = require("../config/db");

// ── SAVE APPLICATION ──────────────────────────────────────────────────────────
exports.saveApplication = async (req, res) => {
  const { applicant_id } = req.user;
  const {
    // Step 1
    firstName, lastName, dob, gender, phone,
    address, city, state, pincode, nationality,
    // Step 2
    degrees,         // array of degree objects
    twelthBoard, twelthMarks, twelthYear,
    tenthBoard,  tenthMarks,  tenthYear,
    schoolGapReason,
    // Step 3
    skillsList,        // array of skill strings
    experiences,       // array of work exp objects
    internshipsList,   // array of internship objects
    projectsList,      // array of project objects
    certsList,         // array of certificate objects
    profileLinks,      // array of link objects
    // Step 4
    resumeLink, photoLink, idProofLink,
  } = req.body;

  try {
    // ── 1. personal_info ──────────────────────────────────────────────────────
    await db.execute(
      `INSERT INTO personal_info
         (applicant_id,first_name,last_name,date_of_birth,gender,
          phone,address,city,state,pincode,nationality)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         first_name=VALUES(first_name),last_name=VALUES(last_name),
         date_of_birth=VALUES(date_of_birth),gender=VALUES(gender),
         phone=VALUES(phone),address=VALUES(address),city=VALUES(city),
         state=VALUES(state),pincode=VALUES(pincode),nationality=VALUES(nationality)`,
      [applicant_id,firstName,lastName,dob,gender,
       phone,address,city,state,pincode,nationality]
    ); 

    // ── qualifications (replaces degrees + school_records) ────────────────────
await db.execute(
  `DELETE FROM qualifications WHERE applicant_id = ?`,
  [applicant_id]
);

const quals = [];

// Add Class X
if (tenthBoard || tenthMarks) {
  quals.push([
    applicant_id, 'class_10', 1,
    data.tenthInstitution || '',
    tenthBoard || '',
    'General',
    tenthMarks || '',
    'percentage',
    data.tenthYear || null,
    data.tenthYear || null,
    0,
    null
  ]);
}

// Add Class XII
if (twelthBoard || twelthMarks) {
  quals.push([
    applicant_id, 'class_12', 2,
    data.twelthInstitution || '',
    twelthBoard || '',
    data.twelthStream || '',
    twelthMarks || '',
    'percentage',
    data.twelthYear || null,
    data.twelthYear || null,
    0,
    schoolGapReason || null
  ]);
}

// Add all degrees dynamically
const degreeTypeMap = {
  'Diploma':  'diploma',
  'B.Tech':   'undergraduate', 'B.E.':  'undergraduate',
  'B.Sc':     'undergraduate', 'B.Com': 'undergraduate',
  'B.A.':     'undergraduate', 'BCA':   'undergraduate',
  'BBA':      'undergraduate',
  'M.Tech':   'postgraduate',  'M.E.':  'postgraduate',
  'M.Sc':     'postgraduate',  'MBA':   'postgraduate',
  'MCA':      'postgraduate',  'M.A.':  'postgraduate',
  'M.Com':    'postgraduate',
  'Ph.D':     'doctorate',
  'Other':    'other',
};

if (Array.isArray(degrees)) {
  degrees.forEach((deg, i) => {
    const qType = degreeTypeMap[deg.degree] || 'undergraduate';
    const resultType = (deg.cgpa && deg.cgpa.toString().includes('.'))
                       ? 'cgpa' : 'percentage';
    quals.push([
      applicant_id, qType, i + 3,
      deg.institution || '',
      deg.institution || '',
      deg.branch || '',
      deg.cgpa || '',
      resultType,
      null,
      deg.passingYear || null,
      0,
      deg.gapReason || null
    ]);
  });
}

// Insert all qualifications
for (const q of quals) {
  await db.execute(
    `INSERT IGNORE INTO qualifications
       (applicant_id, qualification_type, display_order,
        institution_name, board_university, field_of_study,
        result_value, result_type, start_year, end_year,
        is_ongoing, gap_reason)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    q
  );
}

    // ── 4. skills (delete old, insert fresh) ──────────────────────────────────
    await db.execute(`DELETE FROM skills WHERE applicant_id=?`,[applicant_id]);
    if (Array.isArray(skillsList) && skillsList.length > 0) {
      for (let i = 0; i < skillsList.length; i++) {
        await db.execute(
          `INSERT IGNORE INTO skills (applicant_id,skill_name,skill_order)
           VALUES (?,?,?)`,
          [applicant_id, skillsList[i], i+1]
        );
      }
    }

    // ── 5. work_experience (delete old, insert fresh) ─────────────────────────
    await db.execute(`DELETE FROM work_experience WHERE applicant_id=?`,[applicant_id]);
    if (Array.isArray(experiences) && experiences.length > 0) {
      for (const e of experiences) {
        await db.execute(
          `INSERT INTO work_experience
             (applicant_id,company_name,role,start_date,end_date,
              currently_working,skills_learned,description)
           VALUES (?,?,?,?,?,?,?,?)`,
          [applicant_id,
           e.company||'', e.role||'',
           e.startDate||'', e.currentlyWorking ? null : (e.endDate||''),
           e.currentlyWorking ? 1 : 0,
           Array.isArray(e.skillsLearned) ? e.skillsLearned.join(', ') : '',
           e.description||'']
        );
      }
    }

    // ── 6. internships (delete old, insert fresh) ─────────────────────────────
    await db.execute(`DELETE FROM internships WHERE applicant_id=?`,[applicant_id]);
    if (Array.isArray(internshipsList) && internshipsList.length > 0) {
      for (const i of internshipsList) {
        await db.execute(
          `INSERT INTO internships
             (applicant_id,organisation,role,start_date,end_date,
              currently_interning,skills_learned,description)
           VALUES (?,?,?,?,?,?,?,?)`,
          [applicant_id,
           i.company||i.organisation||'', i.role||'',
           i.startDate||'', i.currentlyWorking ? null : (i.endDate||''),
           i.currentlyWorking ? 1 : 0,
           Array.isArray(i.skillsLearned) ? i.skillsLearned.join(', ') : '',
           i.description||'']
        );
      }
    }

    // ── 7. projects (delete old, insert fresh) ────────────────────────────────
    await db.execute(`DELETE FROM projects WHERE applicant_id=?`,[applicant_id]);
    if (Array.isArray(projectsList) && projectsList.length > 0) {
      for (const p of projectsList) {
        await db.execute(
          `INSERT INTO projects
             (applicant_id,title,project_url,description,tech_skills,
              start_date,end_date,is_ongoing)
           VALUES (?,?,?,?,?,?,?,?)`,
          [applicant_id,
           p.title||'', p.url||p.project_url||'',
           p.description||'',
           Array.isArray(p.techSkills) ? p.techSkills.join(', ') : (p.techSkills||''),
           p.startDate||'',
           p.ongoing ? null : (p.endDate||''),
           p.ongoing ? 1 : 0]
        );
      }
    }

    // ── 8. certificates (delete old, insert fresh) ────────────────────────────
    await db.execute(`DELETE FROM certificates WHERE applicant_id=?`,[applicant_id]);
    if (Array.isArray(certsList) && certsList.length > 0) {
      for (const c of certsList) {
        await db.execute(
          `INSERT INTO certificates
             (applicant_id,cert_name,issuing_org,credential_url,date_issued)
           VALUES (?,?,?,?,?)`,
          [applicant_id,
           c.name||c.cert_name||'',
           c.issuer||c.issuing_org||'',
           c.credentialUrl||c.credential_url||'',
           c.date||c.date_issued||'']
        );
      }
    }

    // ── 9. profile_links (delete old, insert fresh) ───────────────────────────
    await db.execute(`DELETE FROM profile_links WHERE applicant_id=?`,[applicant_id]);
    if (Array.isArray(profileLinks) && profileLinks.length > 0) {
      for (const l of profileLinks) {
        if (!l.url && !l.profile_url) continue;
        await db.execute(
          `INSERT IGNORE INTO profile_links
             (applicant_id,platform_name,platform_icon,profile_url)
           VALUES (?,?,?,?)`,
          [applicant_id,
           l.label||l.platform_name||'Other',
           l.icon||l.platform_icon||'',
           l.url||l.profile_url||'']
        );
      }
    }

    // ── 10. documents ─────────────────────────────────────────────────────────
    await db.execute(
      `INSERT INTO documents
         (applicant_id,resume_filename,photo_filename,id_proof_filename)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE
         resume_filename=VALUES(resume_filename),
         photo_filename=VALUES(photo_filename),
         id_proof_filename=VALUES(id_proof_filename)`,
      [applicant_id, resumeLink||'', photoLink||'', idProofLink||'']
    );

    // ── 11. applications ──────────────────────────────────────────────────────
    await db.execute(
      `INSERT INTO applications
         (applicant_id,application_code,declaration_agreed,final_status)
       VALUES (?,?,1,'submitted')
       ON DUPLICATE KEY UPDATE
         final_status='submitted',submitted_at=CURRENT_TIMESTAMP`,
      [applicant_id, applicant_id]
    );

    // ── 12. update master status ──────────────────────────────────────────────
    await db.execute(
      `UPDATE applicants SET status='submitted' WHERE applicant_id=?`,
      [applicant_id]
    );

    return res.status(200).json({
      success: true,
      message: "Application submitted successfully!",
      application_code: applicant_id,
    });

  } catch (error) {
    console.error("Save error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save application.",
      error: error.message,
    });
  }
};

// ── GET APPLICATION ───────────────────────────────────────────────────────────
exports.getApplication = async (req, res) => {
  const { applicant_id } = req.user;
  try {
    // Get main data
    const [main] = await db.execute(
      `SELECT a.*,
         p.first_name,p.last_name,p.date_of_birth,p.gender,
         p.phone,p.address,p.city,p.state,p.pincode,p.nationality,
         s.tenth_board,s.tenth_marks,s.tenth_year,
         s.twelfth_board,s.twelfth_marks,s.twelfth_year,s.school_gap_reason,
         d.resume_filename,d.photo_filename,d.id_proof_filename,
         ap.application_code,ap.final_status,ap.submitted_at,ap.reviewer_notes
       FROM applicants a
       LEFT JOIN personal_info  p  ON a.applicant_id=p.applicant_id
       LEFT JOIN school_records s  ON a.applicant_id=s.applicant_id
       LEFT JOIN documents      d  ON a.applicant_id=d.applicant_id
       LEFT JOIN applications   ap ON a.applicant_id=ap.applicant_id
       WHERE a.applicant_id=?`,
      [applicant_id]
    );
    if (main.length === 0)
      return res.status(404).json({ success:false, message:"Not found." });

    // Get arrays
    const [degrees]     = await db.execute(`SELECT * FROM degrees WHERE applicant_id=? ORDER BY degree_order`,[applicant_id]);
    const [skills]      = await db.execute(`SELECT skill_name FROM skills WHERE applicant_id=? ORDER BY skill_order`,[applicant_id]);
    const [workExp]     = await db.execute(`SELECT * FROM work_experience WHERE applicant_id=?`,[applicant_id]);
    const [interns]     = await db.execute(`SELECT * FROM internships WHERE applicant_id=?`,[applicant_id]);
    const [projects]    = await db.execute(`SELECT * FROM projects WHERE applicant_id=?`,[applicant_id]);
    const [certs]       = await db.execute(`SELECT * FROM certificates WHERE applicant_id=?`,[applicant_id]);
    const [links]       = await db.execute(`SELECT * FROM profile_links WHERE applicant_id=?`,[applicant_id]);

    return res.status(200).json({
      success: true,
      data: {
        ...main[0],
        degrees,
        skillsList:       skills.map(s => s.skill_name),
        experiences:      workExp,
        internshipsList:  interns,
        projectsList:     projects,
        certsList:        certs,
        profileLinks:     links,
      }
    });
  } catch (error) {
    console.error("Get error:", error);
    return res.status(500).json({ success:false, message:"Failed to fetch." });
  }
};