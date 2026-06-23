import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Printer, Download } from 'lucide-react';
import { FilledForm } from '../types';
import { generateFormPDF } from '../utils/formPdf';

interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (formType: string, formData: any) => void;
  participantName?: string;
}

const FORM_TYPES = [
  'School Visit',
  'Home Visit',
  'Sick Participant Follow',
  'Follow-Up',
  'Referral',
  'Discharge Summary'
] as const;

export const FormModal: React.FC<FormModalProps> = ({ isOpen, onClose, onSave, participantName }) => {
  const [formType, setFormType] = useState<typeof FORM_TYPES[number]>('School Visit');
  const [data, setData] = useState<any>({});
  const [errors, setErrors] = useState<{ idNo?: string; date?: string }>({});

  if (!isOpen) return null;

  const validateForm = () => {
    if (formType === 'Home Visit') {
      const newErrors: { idNo?: string; date?: string } = {};
      if (!data.idNo || !data.idNo.trim()) {
        newErrors.idNo = 'ID Number conforms to format HV-YYYY-XX and is required to map physical records.';
      }
      if (!data.date || !data.date.trim()) {
        newErrors.date = 'Date of Visit is required for scheduling chronological assessments.';
      }
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return false;
      }
    }
    setErrors({});
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    onSave(formType, data);
  };

  const updateData = (field: string, value: any) => {
    setData((prev: any) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900"
      />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest font-mono">
            New Structured Form
          </h3>
          <button
            onClick={onClose}
            className="p-1 px-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="structured-form" onSubmit={handleSubmit} className="space-y-6">
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block mb-1">Select Form Type</label>
              <select
                value={formType}
                onChange={(e) => {
                  setFormType(e.target.value as any);
                  setData({});
                  setErrors({});
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400"
              >
                {FORM_TYPES.map(type => (
                  <option key={type} value={type}>{type} Form</option>
                ))}
              </select>
            </div>

            {formType === 'School Visit' && (
              <div className="space-y-6 animate-fade-in text-xs text-slate-600">
                {/* 1. GENERAL INFORMATION */}
                <div className="space-y-3">
                  <h4 className="font-bold text-[11px] uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-1">1. General Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="font-semibold block mb-1">Staff Name(s)</label><input type="text" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('staffName', e.target.value)} /></div>
                    <div><label className="font-semibold block mb-1">FCP Name</label><input type="text" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('fcpName', e.target.value)} /></div>
                    <div><label className="font-semibold block mb-1">Date of Visit</label><input type="date" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('date', e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="font-semibold block mb-1">Time From</label><input type="time" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('timeFrom', e.target.value)} /></div>
                      <div><label className="font-semibold block mb-1">Time To</label><input type="time" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('timeTo', e.target.value)} /></div>
                    </div>
                    <div><label className="font-semibold block mb-1">School Name</label><input type="text" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('schoolName', e.target.value)} /></div>
                    <div><label className="font-semibold block mb-1">School Location</label><input type="text" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('schoolLocation', e.target.value)} /></div>
                    <div>
                      <label className="font-semibold block mb-1">School Type</label>
                      <select className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('schoolType', e.target.value)}>
                        <option value="">Select...</option><option value="Public">Public</option><option value="Private">Private</option><option value="Community">Community</option><option value="Faith-Based">Faith-Based</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">School Level</label>
                      <select className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('schoolLevel', e.target.value)}>
                        <option value="">Select...</option><option value="Primary">Primary</option><option value="Secondary">Secondary</option><option value="Vocational">Vocational</option><option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. PURPOSE OF VISIT */}
                <div className="space-y-3">
                  <h4 className="font-bold text-[11px] uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-1">2. Purpose of Visit</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {['Check on Sponsored Learners', 'Monitor School Environment', 'Follow-Up on Support Given', 'Hold Discussions with Teachers/Admin', 'Assess Performance and Attendance'].map(purpose => (
                      <label key={purpose} className="flex items-center gap-2">
                        <input type="checkbox" onChange={e => updateData(`purpose_${purpose}`, e.target.checked)} />
                        {purpose}
                      </label>
                    ))}
                    <label className="flex items-center gap-2">
                      <input type="checkbox" onChange={e => updateData('purpose_Other_Checked', e.target.checked)} />
                      Other
                      <input type="text" placeholder="Specify..." className="border-b border-slate-300 ml-2 focus:outline-none" onChange={e => updateData('purpose_Other', e.target.value)} />
                    </label>
                  </div>
                </div>

                {/* 3. PARTICIPANT INFORMATION */}
                <div className="space-y-3">
                  <h4 className="font-bold text-[11px] uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-1">3. Participant Information</h4>
                  <p className="text-[10px] text-slate-500">Record learner details manually or assume auto-filled context.</p>
                  <textarea className="w-full bg-white border border-slate-200 rounded p-2" rows={3} placeholder="Full Name | Class | Gender | Attendance | Progress | Well-being | Remarks" onChange={e => updateData('participantInfo', e.target.value)}></textarea>
                </div>

                {/* 4. LEARNER WELFARE */}
                <div className="space-y-3">
                  <h4 className="font-bold text-[11px] uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-1">4. Learner Welfare & Concerns</h4>
                  <div className="space-y-2">
                    {[
                      'Learner has school uniform',
                      'Learner has learning materials',
                      'Learner appears physically healthy',
                      'Attends school regularly',
                      'Receives school meals',
                      'Shows signs of distress or abuse'
                    ].map((welfare, i) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 pb-2 border-b border-slate-50">
                        <span className="flex-1 font-medium">{welfare}</span>
                        <select className="bg-white border border-slate-200 rounded p-1 w-20" onChange={e => updateData(`welfare_${i}`, e.target.value)}>
                          <option value="">...</option><option value="Yes">Yes</option><option value="No">No</option>
                        </select>
                        <input type="text" placeholder="Remarks" className="bg-white border border-slate-200 rounded p-1 flex-1" onChange={e => updateData(`welfare_remarks_${i}`, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. MEETING NOTES */}
                <div className="space-y-3">
                  <h4 className="font-bold text-[11px] uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-1">5. Meeting Notes & Feedback</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="flex items-center gap-2 mb-1"><span className="font-medium">Met with Class Teacher?</span><select className="bg-white border border-slate-200 rounded p-1" onChange={e => updateData('metTeacher', e.target.value)}><option value="">...</option><option value="Yes">Yes</option><option value="No">No</option></select></label>
                      <input type="text" placeholder="Teacher's Name" className="w-full bg-white border border-slate-200 rounded p-2 mb-2" onChange={e => updateData('teacherName', e.target.value)} />
                      <textarea placeholder="Comments on learner" className="w-full bg-white border border-slate-200 rounded p-2" rows={2} onChange={e => updateData('teacherComments', e.target.value)}></textarea>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 mb-1"><span className="font-medium">Met with Head Teacher/Principal?</span><select className="bg-white border border-slate-200 rounded p-1" onChange={e => updateData('metPrincipal', e.target.value)}><option value="">...</option><option value="Yes">Yes</option><option value="No">No</option></select></label>
                      <input type="text" placeholder="Principal's Name" className="w-full bg-white border border-slate-200 rounded p-2 mb-2" onChange={e => updateData('principalName', e.target.value)} />
                      <textarea placeholder="Comments on learner" className="w-full bg-white border border-slate-200 rounded p-2" rows={2} onChange={e => updateData('principalComments', e.target.value)}></textarea>
                    </div>
                    <div>
                      <label className="font-medium block mb-1">Learner's feedback (own words)</label>
                      <textarea className="w-full bg-white border border-slate-200 rounded p-2" rows={2} onChange={e => updateData('learnerFeedback', e.target.value)}></textarea>
                    </div>
                  </div>
                </div>

                {/* 6. SUPPORT USAGE */}
                <div className="space-y-3">
                  <h4 className="font-bold text-[11px] uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-1">6. Support Usage</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-2 mb-1"><span className="font-medium">Fees Paid</span><select className="bg-white border border-slate-200 rounded p-1" onChange={e => updateData('feesPaid', e.target.value)}><option value="">...</option><option value="Yes">Yes</option><option value="No">No</option></select></label>
                      <input type="text" placeholder="Amount: UGSH" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('feesAmt', e.target.value)} />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 mb-1"><span className="font-medium">Uniform Provided</span><select className="bg-white border border-slate-200 rounded p-1" onChange={e => updateData('uniformProv', e.target.value)}><option value="">...</option><option value="Yes">Yes</option><option value="No">No</option></select></label>
                      <input type="date" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('uniformDate', e.target.value)} />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 mb-1"><span className="font-medium">Books Provided</span><select className="bg-white border border-slate-200 rounded p-1" onChange={e => updateData('booksProv', e.target.value)}><option value="">...</option><option value="Yes">Yes</option><option value="No">No</option></select></label>
                      <input type="text" placeholder="List items" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('booksList', e.target.value)} />
                    </div>
                    <div>
                      <label className="font-medium block mb-1">Other Support</label>
                      <input type="text" className="w-full bg-white border border-slate-200 rounded p-2" onChange={e => updateData('otherSupport', e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* 7. OBSERVATIONS */}
                <div className="space-y-3">
                  <h4 className="font-bold text-[11px] uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-1">7. Observations & Recommendations</h4>
                  <textarea placeholder="General Observations" className="w-full bg-white border border-slate-200 rounded p-2" rows={3} onChange={e => updateData('observations', e.target.value)}></textarea>
                  <textarea placeholder="Recommendations / Action Points (Issue | Action | Person | Timeline)" className="w-full bg-white border border-slate-200 rounded p-2" rows={3} onChange={e => updateData('recommendations', e.target.value)}></textarea>
                </div>
              </div>
            )}

            {formType === 'Home Visit' && (
              <div className="space-y-6 animate-fade-in text-xs text-slate-600">
                
                {/* Encouraging Banner */}
                <div className="bg-gradient-to-r from-indigo-50 to-rose-50 border border-indigo-100 rounded-xl p-3.5 flex items-start gap-2.5">
                  <span className="text-base">💡</span>
                  <div>
                    <h5 className="font-bold text-indigo-950 text-[11px] uppercase tracking-wider mb-0.5">Assistance Guidance Tip</h5>
                    <p className="text-[10.5px] text-slate-600 leading-normal">
                      We highly encourage selecting all **highlighted dropdown choices** first to establish standard data points, then complete any freeform text fields. This guarantees accurate AI summarization and reports.
                    </p>
                  </div>
                </div>

                {/* 1. BASIC INFORMATION */}
                <div className="space-y-3">
                  <h4 className="font-mono font-bold text-[11px] uppercase text-rose-600 tracking-wider border-b border-rose-100 pb-1 flex items-center gap-1.5">
                    <span>1.</span> BASIC INFORMATION
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-705 block mb-1">
                        ID NO <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        placeholder="e.g. HV-2026-98" 
                        value={data.idNo || ''}
                        className={`w-full bg-white border ${errors.idNo ? 'border-rose-500 ring-1 ring-rose-100 bg-rose-50/10' : 'border-slate-200'} rounded-xl p-2.5 text-xs transition-all focus:border-rose-400 focus:outline-none`} 
                        onChange={e => {
                          updateData('idNo', e.target.value);
                          if (errors.idNo) {
                            setErrors(prev => ({ ...prev, idNo: undefined }));
                          }
                        }} 
                      />
                      {errors.idNo && (
                        <p className="text-rose-500 text-[10.5px] font-medium mt-1 leading-tight flex items-center gap-1">
                          <span>⚠️</span> {errors.idNo}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="font-semibold text-slate-705 block mb-1">
                        Date of Visit <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="date" 
                        value={data.date || ''}
                        className={`w-full bg-white border ${errors.date ? 'border-rose-500 ring-1 ring-rose-100 bg-rose-50/10' : 'border-slate-200'} rounded-xl p-2.5 text-xs transition-all focus:border-rose-400 focus:outline-none`} 
                        onChange={e => {
                          updateData('date', e.target.value);
                          if (errors.date) {
                            setErrors(prev => ({ ...prev, date: undefined }));
                          }
                        }} 
                      />
                      {errors.date && (
                        <p className="text-rose-500 text-[10.5px] font-medium mt-1 leading-tight flex items-center gap-1">
                          <span>⚠️</span> {errors.date}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="font-semibold text-slate-705 block mb-1">Village/Community</label>
                      <input 
                        type="text" 
                        placeholder="Village name" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs transition-colors focus:border-rose-400 focus:outline-none" 
                        onChange={e => updateData('village', e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-705 block mb-1">Sub-county/District</label>
                      <input 
                        type="text" 
                        placeholder="Sub-county or District" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs transition-colors focus:border-rose-400 focus:outline-none" 
                        onChange={e => updateData('district', e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-705 block mb-1">Name of Assessor</label>
                      <input 
                        type="text" 
                        placeholder="Visiting officer's name" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs transition-colors focus:border-rose-400 focus:outline-none" 
                        onChange={e => updateData('assessorName', e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-705 block mb-1">Position / Organization</label>
                      <input 
                        type="text" 
                        placeholder="Position and Organization" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs transition-colors focus:border-rose-400 focus:outline-none" 
                        onChange={e => updateData('assessorPosition', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

                {/* 2. FAMILY COMPOSITION */}
                <div className="space-y-3">
                  <h4 className="font-mono font-bold text-[11px] uppercase text-rose-600 tracking-wider border-b border-rose-100 pb-1 flex items-center gap-1.5">
                    <span>2.</span> FAMILY COMPOSITION
                  </h4>
                  <p className="text-[10px] text-slate-400 -mt-1 leading-normal">
                    Enter key family members living together with the learner (up to 3 members).
                  </p>
                  <div className="space-y-2.5">
                    {[0, 1, 2].map(idx => (
                      <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2 text-slate-700">
                        <div className="sm:col-span-4">
                          <label className="text-[9px] font-mono text-slate-400 block uppercase mb-0.5">Name</label>
                          <input 
                            type="text" 
                            placeholder={`Family member #${idx + 1}`} 
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs focus:outline-none focus:border-indigo-400" 
                            onChange={e => updateData(`fam_name_${idx}`, e.target.value)} 
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[9px] font-mono text-slate-400 block uppercase mb-0.5">Sex</label>
                          <select 
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs focus:outline-none focus:border-indigo-400 cursor-pointer"
                            onChange={e => updateData(`fam_sex_${idx}`, e.target.value)}
                          >
                            <option value="">Choose...</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </select>
                        </div>
                        <div className="sm:col-span-1.5">
                          <label className="text-[9px] font-mono text-slate-400 block uppercase mb-0.5">Age</label>
                          <input 
                            type="number" 
                            placeholder="Age" 
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs focus:outline-none focus:border-indigo-400" 
                            onChange={e => updateData(`fam_age_${idx}`, e.target.value)} 
                          />
                        </div>
                        <div className="sm:col-span-2.5">
                          <label className="text-[9px] font-mono text-slate-400 block uppercase mb-0.5">Relationship</label>
                          <select 
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs focus:outline-none focus:border-indigo-400 cursor-pointer"
                            onChange={e => updateData(`fam_rel_${idx}`, e.target.value)}
                          >
                            <option value="">Dropdown...</option>
                            <option value="Mother">Mother</option>
                            <option value="Father">Father</option>
                            <option value="Sibling">Sibling</option>
                            <option value="Grandmother">Grandmother</option>
                            <option value="Grandfather">Grandfather</option>
                            <option value="Aunt">Aunt</option>
                            <option value="Uncle">Uncle</option>
                            <option value="Other">Other relative</option>
                          </select>
                        </div>
                        <div className="sm:col-span-12 mt-1 sm:mt-0">
                          <label className="text-[9px] font-mono text-slate-400 block uppercase mb-0.5">Occupation / Schooling</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Unemployed, Farming, Primary Student, Charcoal seller" 
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs focus:outline-none focus:border-indigo-400" 
                            onChange={e => updateData(`fam_occ_${idx}`, e.target.value)} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. FOUR ASPECTS OF ASSESSMENT */}
                <div className="space-y-4">
                  <h4 className="font-mono font-bold text-[11px] uppercase text-rose-600 tracking-wider border-b border-rose-100 pb-1 flex items-center gap-1.5">
                    <span>3.</span> THE FOUR ASPECTS OF WELL-BEING ASSESSMENT
                  </h4>

                  {/* Aspect A: Social */}
                  <div className="p-4 border border-indigo-150 rounded-2xl bg-indigo-50/10 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-1">
                      <span className="font-bold text-[10.5px] uppercase tracking-wider text-indigo-950 font-sans">
                        🟢 ASPECT A: SOCIAL WELL-BEING
                      </span>
                      <span className="text-[8.5px] font-mono bg-indigo-100 text-indigo-750 px-2 py-0.5 rounded-full font-bold">RECONGNIZE FIRST</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Family relationships (harmonious/conflict) <span className="text-indigo-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-indigo-200/80 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-550 ring-2 ring-indigo-100/50 cursor-pointer"
                          onChange={e => updateData('soc_relationships', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Harmonious (Respectful, supportive, communicative)">Harmonious (Respectful, supportive, communicative)</option>
                          <option value="Generally peaceful with minor conflicts">Generally peaceful with minor conflicts</option>
                          <option value="Moderate conflicts / Tense relations">Moderate conflicts / Tense relations</option>
                          <option value="High conflict / Hostile family environment">High conflict / Hostile family environment</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Decision-making structure (who decides?) <span className="text-indigo-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-indigo-200/80 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-550 ring-2 ring-indigo-100/50 cursor-pointer"
                          onChange={e => updateData('soc_decisionMaking', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Joint partnership/Both caregiver parents">Joint partnership (Both parents decide)</option>
                          <option value="Primary caregiver / Mother solely">Primary caregiver / Mother solely</option>
                          <option value="Father only / Male head of manyatta">Father only / Male head of household</option>
                          <option value="Grandparent or tribal elder circle">Grandparent or tribal elder circle</option>
                          <option value="External relative decisions">External family relative decides</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Child care & protection practices <span className="text-indigo-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-indigo-200/80 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-550 ring-2 ring-indigo-100/50 cursor-pointer"
                          onChange={e => updateData('soc_childrenCare', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Excellent (Safe, caring, supportive, well-supervised)">Excellent (Highly supportive, safe, diligent supervision)</option>
                          <option value="Adequate child care with basic needs met">Adequate child care with basic needs met</option>
                          <option value="Challenging (Often unsupervised / neglected)">Challenging (Often left unsupervised/needs assistance)</option>
                          <option value="Highly unsafe / Severe neglect risks">Highly unsafe / Severe neglect risks</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Social support from community/relatives <span className="text-indigo-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-indigo-200/80 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-550 ring-2 ring-indigo-100/50 cursor-pointer"
                          onChange={e => updateData('soc_socialSupport', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Strong (Active help from church, family, and neighbors)">Strong (Active support from church, family, neighborhood)</option>
                          <option value="Moderate (Occasional aid, helpful neighbor group)">Moderate (Occasional aid, helpful neighbors)</option>
                          <option value="Low (Relies mainly on self, isolated)">Low (Relies mainly on self, isolated)</option>
                          <option value="No external support (Extremely vulnerable)">No external support (Extremely vulnerable)</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2 p-3 bg-rose-50/50 border border-rose-100 rounded-xl space-y-2">
                        <label className="font-bold text-slate-800 block">
                          Any cases of violence, neglect, or abuse observed/reported?
                        </label>
                        <select 
                          className="w-56 bg-white border border-rose-220 rounded-lg p-1.5 text-xs focus:outline-none cursor-pointer"
                          onChange={e => updateData('social_abuse_reported', e.target.value)}
                        >
                          <option value="No">No - None detected / reported</option>
                          <option value="Yes">Yes - Cases Observed or Reported</option>
                        </select>
                        <textarea 
                          placeholder="If yes, select Yes above and describe details here..." 
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none" 
                          rows={2} 
                          onChange={e => updateData('social_abuse_explanation', e.target.value)}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-800 block mb-1">
                          Overall Social Wellbeing Rating
                        </label>
                        <select 
                          className="w-56 bg-indigo-50 border-2 border-indigo-300 rounded-xl p-2 font-bold text-indigo-950 cursor-pointer"
                          onChange={e => updateData('soc_rating', e.target.value)}
                        >
                          <option value="">Select Rating Choice...</option>
                          <option value="5">5 ★★★★★ (Excellent)</option>
                          <option value="4">4 ★★★★☆ (Good)</option>
                          <option value="3">3 ★★★☆☆ (Fair)</option>
                          <option value="2">2 ★★☆☆☆ (Poor)</option>
                          <option value="1">1 ★☆☆☆☆ (Very Poor)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Aspect B: Economic */}
                  <div className="p-4 border border-rose-150 rounded-2xl bg-rose-50/10 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-rose-100 pb-1">
                      <span className="font-bold text-[10.5px] uppercase tracking-wider text-rose-955 font-sans">
                        🟡 ASPECT B: ECONOMIC WELL-BEING
                      </span>
                      <span className="text-[8.5px] font-mono bg-rose-100 text-rose-750 px-2 py-0.5 rounded-full font-bold">RECONGNIZE FIRST</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Main source of income <span className="text-rose-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-rose-200/80 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-550 ring-2 ring-rose-100/50 cursor-pointer"
                          onChange={e => updateData('econ_incomeSource', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Seasonal pastoral livestock trade">Seasonal pastoral livestock trade</option>
                          <option value="Charcoal burning & trading">Charcoal burning & trading</option>
                          <option value="Small retail enterprise / food stall">Small retail enterprise / food stall</option>
                          <option value="Casual Day Labor (washing, construction)">Casual Day Labor (washing, construction)</option>
                          <option value="Subsistence agriculture / farming">Subsistence agriculture / farming</option>
                          <option value="Stable salaried employment">Stable salaried employment</option>
                          <option value="No stable income (dependent/unemployed)">No stable income (dependent/unemployed)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Employment status of adults <span className="text-rose-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-rose-200/80 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-550 ring-2 ring-rose-100/50 cursor-pointer"
                          onChange={e => updateData('econ_employmentStatus', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Fully employed (Full-time active work)">Fully employed (Full-time active work)</option>
                          <option value="Part-time or seasonal contracts">Part-time or seasonal contracts</option>
                          <option value="Irregular/underemployed casual work">Irregular / underemployed casual work</option>
                          <option value="Completely unemployed (No source)">Completely unemployed (No source)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Average monthly income (estimate) <span className="text-rose-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-rose-200/80 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-550 ring-2 ring-rose-100/50 cursor-pointer"
                          onChange={e => updateData('econ_monthlyIncome', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Less than 50,000 UGX">Less than 50,000 UGX</option>
                          <option value="50,000 - 150,000 UGX">50,000 - 150,000 UGX</option>
                          <option value="150,000 - 300,000 UGX">150,000 - 300,000 UGX</option>
                          <option value="300,000 - 600,000 UGX">300,000 - 600,000 UGX</option>
                          <option value="Over 600,000 UGX">Over 600,000 UGX</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Food security status <span className="text-rose-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-rose-200/80 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-550 ring-2 ring-rose-100/50 cursor-pointer"
                          onChange={e => updateData('econ_foodSecurity', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Always enough food (3 balanced meals daily)">Always enough food (3 balanced meals daily)</option>
                          <option value="Sometimes enough food (Occasional skipping of meals)">Sometimes enough food (Occasional skipping of meals)</option>
                          <option value="Often insufficient food (Regularly skipping, nutritional distress)">Often insufficient food (Regularly skipping/nutritional distress)</option>
                          <option value="Severe food shortage (Critical intervention required)">Severe food shortage (Critical intervention required)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">Household assets / livelihood activities</label>
                        <input 
                          type="text" 
                          placeholder="e.g. 5 Goats, 3 chickens, sewing machine"
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none" 
                          onChange={e => updateData('econ_assets', e.target.value)} 
                        />
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">Major economic challenges</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Drought, disease of livestock, loss of work" 
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none" 
                          onChange={e => updateData('econ_challenges', e.target.value)} 
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-800 block mb-1">
                          Overall Economic Wellbeing Rating
                        </label>
                        <select 
                          className="w-56 bg-rose-50 border-2 border-rose-300 rounded-xl p-2 font-bold text-rose-950 cursor-pointer"
                          onChange={e => updateData('econ_rating', e.target.value)}
                        >
                          <option value="">Select Rating Choice...</option>
                          <option value="5">5 ★★★★★ (Excellent)</option>
                          <option value="4">4 ★★★★☆ (Good)</option>
                          <option value="3">3 ★★★☆☆ (Fair)</option>
                          <option value="2">2 ★★☆☆☆ (Poor)</option>
                          <option value="1">1 ★☆☆☆☆ (Very Poor)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Aspect C: Health */}
                  <div className="p-4 border border-emerald-150 rounded-2xl bg-emerald-50/10 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-emerald-100 pb-1">
                      <span className="font-bold text-[10.5px] uppercase tracking-wider text-emerald-950 font-sans">
                        🟢 ASPECT C: HEALTH & SANITATION WELL-BEING
                      </span>
                      <span className="text-[8.5px] font-mono bg-emerald-100 text-emerald-750 px-2 py-0.5 rounded-full font-bold">RECONGNIZE FIRST</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Access to health services <span className="text-emerald-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-emerald-200/85 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-550 ring-2 ring-emerald-100/50 cursor-pointer"
                          onChange={e => updateData('health_access', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Good">Good (Facility nearby, affordable)</option>
                          <option value="Fair">Fair (Distant, moderate expenses)</option>
                          <option value="Poor">Poor (Extremely distant, no transport, unaffordable)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Distance to nearest health facility <span className="text-emerald-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-emerald-200/85 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-550 ring-2 ring-emerald-100/50 cursor-pointer"
                          onChange={e => updateData('health_distance', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Under 2 km (Walking distance)">Under 2 km (Walking distance)</option>
                          <option value="2 to 5 km (Require transport or long walk)">2 to 5 km (Require transport / long walk)</option>
                          <option value="5 to 10 km (Requires motor cycle/bodaboda)">5 to 10 km (Requires motor cycle/bodaboda)</option>
                          <option value="Over 10 km (Extremely distant)">Over 10 km (Extremely distant)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Immunization status of children <span className="text-emerald-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-emerald-200/85 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-550 ring-2 ring-emerald-100/50 cursor-pointer"
                          onChange={e => updateData('health_immunization', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Complete">Complete (Fully immunized for age group)</option>
                          <option value="Incomplete">Incomplete (Missed doses / needs tracing)</option>
                          <option value="Unknown">Unknown (No health records / card lost)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Sanitation (latrine, handwashing) <span className="text-emerald-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-emerald-200/85 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-550 ring-2 ring-emerald-100/50 cursor-pointer"
                          onChange={e => updateData('health_sanitation', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Good">Good (Private pit latrine & clean wash area)</option>
                          <option value="Fair">Fair (Shared facility, moderate cleanliness)</option>
                          <option value="Poor">Poor (No sanitation facility, open bush defecation)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-705 mb-1">Water Source</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Community borehole, untreated river bedwell" 
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none" 
                          onChange={e => updateData('health_waterSource', e.target.value)} 
                        />
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-705 mb-1">Common Illnesses in household</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Malaria, diarrhea, chest infection" 
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none" 
                          onChange={e => updateData('health_illnesses', e.target.value)} 
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-semibold block text-slate-705 mb-1">Health concerns identified</label>
                        <textarea 
                          placeholder="Identify any severe malnutrition, unhealed wounds, active coughs..." 
                          className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs focus:outline-none" 
                          rows={2} 
                          onChange={e => updateData('health_concerns', e.target.value)} 
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-800 block mb-1">
                          Overall Health Wellbeing Rating
                        </label>
                        <select 
                          className="w-56 bg-emerald-50 border-2 border-emerald-300 rounded-xl p-2 font-bold text-emerald-950 cursor-pointer"
                          onChange={e => updateData('health_rating', e.target.value)}
                        >
                          <option value="">Select Rating Choice...</option>
                          <option value="5">5 ★★★★★ (Excellent)</option>
                          <option value="4">4 ★★★★☆ (Good)</option>
                          <option value="3">3 ★★★☆☆ (Fair)</option>
                          <option value="2">2 ★★☆☆☆ (Poor)</option>
                          <option value="1">1 ★☆☆☆☆ (Very Poor)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Aspect D: Education */}
                  <div className="p-4 border border-teal-150 rounded-2xl bg-teal-50/10 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-teal-100 pb-1">
                      <span className="font-bold text-[10.5px] uppercase tracking-wider text-teal-950 font-sans">
                        🟢 ASPECT D: EDUCATION & DEVELOPMENT WELL-BEING
                      </span>
                      <span className="text-[8.5px] font-mono bg-teal-100 text-teal-750 px-2 py-0.5 rounded-full font-bold">RECONGNIZE FIRST</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          School attendance of children <span className="text-teal-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-teal-200/85 rounded-xl p-2.5 text-xs focus:outline-none focus:border-teal-550 ring-2 ring-teal-100/50 cursor-pointer"
                          onChange={e => updateData('edu_attendance', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Regular (Enrolled and attending daily)">Regular (Enrolled and attending daily)</option>
                          <option value="Irregular (Misses school due to fees/duties)">Irregular (Misses school due to duties/fees)</option>
                          <option value="Not attending school (Dropped out / never enrolled)">Not attending school (Dropped out/unregistered)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Learning environment at home <span className="text-teal-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-teal-200/85 rounded-xl p-2.5 text-xs focus:outline-none focus:border-teal-550 ring-2 ring-teal-100/50 cursor-pointer"
                          onChange={e => updateData('edu_environment', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="Supportive (Assigned study desk, adequate lighting, quiet)">Supportive (Dedicated desk, lit area, quiet time)</option>
                          <option value="Moderate (Can study, but shared noisy room)">Moderate (Shared space, occasionally loud, chores first)</option>
                          <option value="Poor (No space, lacks lighting, heavy task demands)">Poor (No space, heavy manual tasks, zero study aid)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold block text-slate-700 mb-1">
                          Parental involvement in education <span className="text-teal-600 font-bold">*</span>
                        </label>
                        <select 
                          className="w-full bg-white border-2 border-teal-200/85 rounded-xl p-2.5 text-xs focus:outline-none focus:border-teal-550 ring-2 ring-teal-100/50 cursor-pointer"
                          onChange={e => updateData('edu_involvement', e.target.value)}
                        >
                          <option value="">-- Choose Dropdown Choice --</option>
                          <option value="High (Actively helps, checks homework, attends school)">High (Checks assignment, attends parent days, motivates)</option>
                          <option value="Moderate (Checks report cards, occasional push)">Moderate (Asks about scores, pushes occasionally)</option>
                          <option value="Low (Virtually no awareness or interest in academic progress)">Low (No awareness, low valuation, illiterate guidance)</option>
                        </select>
                      </div>

                      <div className="p-3.5 bg-slate-100 border rounded-xl space-y-2">
                        <span className="font-bold text-slate-700 block">Barriers to education (if any):</span>
                        <div className="grid grid-cols-2 gap-1 text-[10px]">
                          {['Fees', 'Child labour', 'Distance', 'Early marriage'].map(val => (
                            <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" onChange={e => updateData(`edu_barrier_${val.replace(/\s+/g, '_')}`, e.target.checked)} />
                              <span>{val}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-300 mt-1">
                          <label className="text-[10px] whitespace-nowrap">Other barrier:</label>
                          <input 
                            type="text" 
                            className="bg-transparent border-b border-slate-300 focus:outline-none flex-1 font-serif italic text-xs text-slate-800" 
                            onChange={e => updateData('edu_barrier_other', e.target.value)} 
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-semibold block text-slate-705 mb-1 font-sans">Comments / Educational remarks</label>
                        <textarea 
                          placeholder="Note down child performance hurdles, teachers advisory or exam metrics..." 
                          className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs focus:outline-none" 
                          rows={2} 
                          onChange={e => updateData('edu_comments', e.target.value)} 
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-slate-800 block mb-1">
                          Overall Education Wellbeing Rating
                        </label>
                        <select 
                          className="w-56 bg-teal-50 border-2 border-teal-300 rounded-xl p-2 font-bold text-teal-950 cursor-pointer"
                          onChange={e => updateData('edu_rating', e.target.value)}
                        >
                          <option value="">Select Rating Choice...</option>
                          <option value="5">5 ★★★★★ (Excellent)</option>
                          <option value="4">4 ★★★★☆ (Good)</option>
                          <option value="3">3 ★★★☆☆ (Fair)</option>
                          <option value="2">2 ★★☆☆☆ (Poor)</option>
                          <option value="1">1 ★☆☆☆☆ (Very Poor)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. GENERAL FAMILY WELLBEING */}
                <div className="space-y-3.5 pt-1">
                  <h4 className="font-mono font-bold text-[11px] uppercase text-rose-600 tracking-wider border-b border-rose-100 pb-1 flex items-center gap-1.5">
                    <span>4.</span> GENERAL FAMILY WELL-BEING
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="font-bold text-slate-800 block mb-1">
                        Overall condition of the household <span className="text-rose-600 font-bold">*</span>
                      </label>
                      <select 
                        className="w-full bg-white border-2 border-amber-300 rounded-xl p-2.5 font-bold text-slate-900 cursor-pointer focus:outline-none"
                        onChange={e => updateData('general_condition', e.target.value)}
                      >
                        <option value="">-- Choose Overall Condition --</option>
                        <option value="Very Good">Very Good - Excellent dwelling health and nutrition</option>
                        <option value="Good">Good - Standard condition with little to no threats</option>
                        <option value="Fair">Fair - Lives alright, but has active vulnerability stressors</option>
                        <option value="Poor">Poor - Deficient housing, meal intervals skip regularly</option>
                        <option value="Critical">Critical - High urgent care, shelter/social distress emergency</option>
                      </select>
                    </div>

                    <div className="p-3.5 bg-rose-50/50 border border-rose-150 rounded-xl space-y-2">
                      <span className="font-bold text-slate-800 block">Urgent needs identified (Select all that check):</span>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        {[
                          { label: 'Food support', key: 'need_Food' },
                          { label: 'Medical support', key: 'need_Medical' },
                          { label: 'School support', key: 'need_School' },
                          { label: 'Shelter improvement', key: 'need_Shelter' },
                          { label: 'Protection intervention', key: 'need_Protection' },
                          { label: 'Livelihood support', key: 'need_Livelihood' }
                        ].map((item) => (
                          <label key={item.key} className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900">
                            <input type="checkbox" onChange={e => updateData(item.key, e.target.checked)} />
                            <span>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="font-semibold block text-slate-705 mb-1">Major Strengths of the Family</label>
                      <textarea 
                        placeholder="e.g. Caring mother, active church member support, resilient child" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs focus:outline-none" 
                        rows={2} 
                        onChange={e => updateData('general_strengths', e.target.value)} 
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="font-semibold block text-slate-705 mb-1 font-medium">Key Vulnerabilities / Risks Identified</label>
                      <textarea 
                        placeholder="e.g. Extreme poverty, alcoholism reported, health negligence" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs focus:outline-none" 
                        rows={2} 
                        onChange={e => updateData('general_vulnerabilities', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

                {/* 5. ACTION PLAN / RECOMMENDATIONS */}
                <div className="space-y-3 pt-1">
                  <h4 className="font-mono font-bold text-[11px] uppercase text-rose-600 tracking-wider border-b border-rose-100 pb-1 flex items-center gap-1.5">
                    <span>5.</span> ACTION PLAN / ADVISORY RECOMMENDATIONS
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="font-semibold block text-slate-705 mb-1">Immediate Actions Required</label>
                      <textarea 
                        placeholder="e.g. Provide mosquito net immediately, register child for medical screening tomorrow..." 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs focus:outline-none" 
                        rows={2} 
                        onChange={e => updateData('plan_immediate', e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="font-semibold block text-slate-705 mb-1">Long-term Support Needed</label>
                      <textarea 
                        placeholder="e.g. Adult literacy program registration, income generating loan recommendation..." 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs focus:outline-none" 
                        rows={2} 
                        onChange={e => updateData('plan_longTerm', e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="font-semibold block text-slate-705 mb-1">Referrals Made (if any)</label>
                      <textarea 
                        placeholder="e.g. Referred to FCP Local Health Center Nurse, Community elder council referral..." 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs focus:outline-none" 
                        rows={1.5} 
                        onChange={e => updateData('plan_referrals', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

                {/* 6. FOLLOW-UP PLAN */}
                <div className="space-y-3 pt-1">
                  <h4 className="font-mono font-bold text-[11px] uppercase text-rose-600 tracking-wider border-b border-rose-100 pb-1 flex items-center gap-1.5">
                    <span>6.</span> FOLLOW-UP PLAN
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="font-semibold block text-slate-705 mb-1">Next Visit Date</label>
                      <input 
                        type="date" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none" 
                        onChange={e => updateData('followUp_nextDate', e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="font-semibold block text-slate-705 mb-1">Responsible Follow-up Officer</label>
                      <input 
                        type="text" 
                        placeholder="Name of officer assigned for verification visit" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none" 
                        onChange={e => updateData('followUp_officer', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

                {/* 7. DECLARATION */}
                <div className="space-y-3 pt-1">
                  <h4 className="font-mono font-bold text-[11px] uppercase text-rose-600 tracking-wider border-b border-rose-100 pb-1 flex items-center gap-1.5">
                    <span>7.</span> DECLARATION AGREEMENT
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="font-semibold block text-slate-705 mb-1">Assessor Name & Signature Status</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Signed by Assessor Felix Rotich" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none" 
                        onChange={e => updateData('declaration_assessor', e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="font-semibold block text-slate-705 mb-1">Household Representative Name & Signature Status</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Signed with thumbprint by Caregiver Maria" 
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none" 
                        onChange={e => updateData('declaration_representative', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

              </div>
            )}

            {formType !== 'School Visit' && formType !== 'Home Visit' && (
              <div className="space-y-4 animate-fade-in text-xs text-slate-600">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Date of Assessment / Visit</label>
                  <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400" onChange={e => updateData('date', e.target.value)} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Purpose / Reason</label>
                  <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400" placeholder="Main reason for this form..." onChange={e => updateData('purpose', e.target.value)} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Detailed Notes / Summary</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400" 
                    rows={6}
                    placeholder="Enter full qualitative notes to be processed by AI."
                    onChange={e => updateData('summary', e.target.value)}
                  ></textarea>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Action Items / Next Steps</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400" 
                    rows={3}
                    placeholder="Any follow ups required?"
                    onChange={e => updateData('actionItems', e.target.value)}
                  ></textarea>
                </div>
              </div>
            )}

          </form>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => generateFormPDF(formType, {}, true, participantName)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-705 rounded-xl text-xs font-semibold shadow-3xs transition-all cursor-pointer"
              title="Print blank form template for physical handwritten data collection"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print Blank Template</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (validateForm()) {
                  generateFormPDF(formType, data, false, participantName);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-750 border border-indigo-200 rounded-xl text-xs font-semibold shadow-3xs transition-all cursor-pointer"
              title="Download currently entered details as structured PDF dossier"
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span>Download Filled PDF</span>
            </button>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="structured-form"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-3xs transition-colors cursor-pointer"
            >
              Save Document
            </button>
          </div>
        </div>

      </motion.div>
    </div>
  );
};
