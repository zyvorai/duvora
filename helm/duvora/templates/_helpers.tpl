{{- define "duvora.name" -}}duvora{{- end -}}

{{- define "duvora.labels" -}}
app.kubernetes.io/name: {{ include "duvora.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "duvora.selector" -}}
app.kubernetes.io/name: {{ include "duvora.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "duvora.secretName" -}}
{{- .Values.auth.existingSecret | default (printf "%s-auth" .Release.Name) -}}
{{- end -}}

{{- define "duvora.agentSecretName" -}}
{{- .Values.agent.existingSecret | default (printf "%s-agent" .Release.Name) -}}
{{- end -}}

{{- define "duvora.agentKeysEnabled" -}}
{{- if or .Values.agent.existingSecret .Values.agent.keys }}true{{ end -}}
{{- end -}}

{{- define "duvora.tlsSecretName" -}}
{{- .Values.tls.existingSecret | default (printf "%s-tls" .Release.Name) -}}
{{- end -}}
