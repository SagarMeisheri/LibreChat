import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { X, Code, Eye, Copy, Check } from 'lucide-react-native';

export interface ArtifactData {
  type: string;
  title: string;
  content: string;
}

interface ArtifactModalProps {
  visible: boolean;
  artifact: ArtifactData | null;
  onClose: () => void;
}

export function ArtifactModal({ visible, artifact, onClose }: ArtifactModalProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);

  if (!artifact) return null;

  const handleCopy = () => {
    // In React Native Expo, Clipboard is available from expo-clipboard if installed
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateHtml = (type: string, code: string) => {
    if (type === 'svg') {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background-color: #171717;
              }
              svg { max-width: 90%; max-height: 90vh; height: auto; }
            </style>
          </head>
          <body>
            ${code}
          </body>
        </html>
      `;
    }

    if (type === 'mermaid') {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
            <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
            <style>
              body {
                margin: 0;
                padding: 16px;
                background-color: #171717;
                color: #ececec;
                display: flex;
                justify-content: center;
              }
            </style>
          </head>
          <body>
            <div class="mermaid">${code}</div>
          </body>
        </html>
      `;
    }

    // Default HTML/JS sandbox
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              margin: 16px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #171717;
              color: #ececec;
            }
          </style>
        </head>
        <body>
          ${code}
        </body>
      </html>
    `;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView className="flex-1 bg-background">
        {/* Modal Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-light bg-surface-primary">
          <View className="flex-1">
            <Text className="text-text-primary font-bold text-base" numberOfLines={1}>
              {artifact.title || 'Code Artifact'}
            </Text>
            <Text className="text-text-tertiary text-xs uppercase">{artifact.type}</Text>
          </View>

          {/* Segmented View Toggle */}
          <View className="flex-row bg-surface-secondary rounded-lg p-1 mx-3 border border-border-light">
            <TouchableOpacity
              onPress={() => setActiveTab('preview')}
              className={`flex-row items-center px-3 py-1.5 rounded-md ${
                activeTab === 'preview' ? 'bg-brand-green' : 'bg-transparent'
              }`}
            >
              <Eye size={14} color="#ececec" />
              <Text className="text-text-primary text-xs font-semibold ml-1.5">Preview</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('code')}
              className={`flex-row items-center px-3 py-1.5 rounded-md ${
                activeTab === 'code' ? 'bg-brand-green' : 'bg-transparent'
              }`}
            >
              <Code size={14} color="#ececec" />
              <Text className="text-text-primary text-xs font-semibold ml-1.5">Code</Text>
            </TouchableOpacity>
          </View>

          {/* Close Button */}
          <TouchableOpacity
            onPress={onClose}
            className="w-8 h-8 rounded-full bg-surface-secondary items-center justify-center border border-border-light"
          >
            <X size={18} color="#ececec" />
          </TouchableOpacity>
        </View>

        {/* Content Body */}
        {activeTab === 'preview' ? (
          <View className="flex-1 bg-[#171717]">
            <WebView
              originWhitelist={['*']}
              source={{ html: generateHtml(artifact.type, artifact.content) }}
              style={{ backgroundColor: '#171717' }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
            />
          </View>
        ) : (
          <View className="flex-1 bg-surface-primary p-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-text-secondary text-xs">Source Code</Text>
              <TouchableOpacity
                onPress={handleCopy}
                className="flex-row items-center bg-surface-secondary px-2.5 py-1 rounded border border-border-light"
              >
                {copied ? (
                  <>
                    <Check size={12} color="#10a37f" />
                    <Text className="text-brand-green text-xs font-medium ml-1">Copied</Text>
                  </>
                ) : (
                  <>
                    <Copy size={12} color="#ececec" />
                    <Text className="text-text-primary text-xs font-medium ml-1">Copy</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 bg-[#111111] p-3 rounded-lg border border-border-light">
              <Text className="text-[#a5d6ff] font-mono text-xs leading-5">
                {artifact.content}
              </Text>
            </ScrollView>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
