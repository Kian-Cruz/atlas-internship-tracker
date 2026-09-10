-- Evaluate the transaction-local owner once per statement, preserving RLS isolation.
ALTER POLICY student_owns_rows ON atlas.companies
 USING (user_id::text = (SELECT current_setting('atlas.user_id', true)))
 WITH CHECK (user_id::text = (SELECT current_setting('atlas.user_id', true)));

ALTER POLICY student_owns_rows ON atlas.applications
 USING (user_id::text = (SELECT current_setting('atlas.user_id', true)))
 WITH CHECK (user_id::text = (SELECT current_setting('atlas.user_id', true)));

ALTER POLICY student_owns_rows ON atlas.interviews
 USING (user_id::text = (SELECT current_setting('atlas.user_id', true)))
 WITH CHECK (user_id::text = (SELECT current_setting('atlas.user_id', true)));

ALTER POLICY student_owns_rows ON atlas.notes
 USING (user_id::text = (SELECT current_setting('atlas.user_id', true)))
 WITH CHECK (user_id::text = (SELECT current_setting('atlas.user_id', true)));

ALTER POLICY student_owns_rows ON atlas.documents
 USING (user_id::text = (SELECT current_setting('atlas.user_id', true)))
 WITH CHECK (user_id::text = (SELECT current_setting('atlas.user_id', true)));

ALTER POLICY student_owns_rows ON atlas.stage_history
 USING (user_id::text = (SELECT current_setting('atlas.user_id', true)))
 WITH CHECK (user_id::text = (SELECT current_setting('atlas.user_id', true)));

ALTER POLICY student_owns_rows ON atlas.rate_limits
 USING (key::text = (SELECT current_setting('atlas.user_id', true)))
 WITH CHECK (key::text = (SELECT current_setting('atlas.user_id', true)));
