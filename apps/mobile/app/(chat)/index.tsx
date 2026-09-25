import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Menu,
  Plus,
  Send,
  Square,
  Sparkles,
  Bot,
  User as UserIcon,
  ChevronDown,
  Wrench,
  Brain,
  Code2,
  Trash2,
  LogOut,
  X,
} from 'lucide-react-native';
import { sendStreamingMessage } from '../../src/services/transport';
import {
  fetchConversations,
  fetchConversationMessages,
  deleteConversation,
  ConvoItem,
} from '../../src/services/api';
import { clearAuthSession, getUserProfile, MobileUser } from '../../src/services/storage';
import { ArtifactModal, ArtifactData } from '../../src/components/ArtifactModal';

interface MessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  toolCall?: {
    id: string;
    name: string;
    args?: Record<string, unknown>;
    status: string;
  };
  artifact?: ArtifactData;
}

const AVAILABLE_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', endpoint: 'openAI' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', endpoint: 'anthropic' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', endpoint: 'google' },
];

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');

  // Modals & Drawers
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactData | null>(null);

  // Conversation history
  const [conversations, setConversations] = useState<ConvoItem[]>([]);
  const [userProfile, setUserProfile] = useState<MobileUser | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getUserProfile().then((u) => setUserProfile(u));
    loadConversations();
  }, []);

  const loadConversations = async () => {
    setLoadingHistory(true);
    try {
      const data = await fetchConversations(1);
      if (data?.conversations) {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.warn('[Chat] Failed to load conversations:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectConversation = async (convo: ConvoItem) => {
    setDrawerOpen(false);
    setActiveConversationId(convo.conversationId);
    setMessages([]);

    try {
      const rawMessages = await fetchConversationMessages(convo.conversationId);
      if (Array.isArray(rawMessages)) {
        const mapped: MessageItem[] = rawMessages.map((m: Record<string, unknown>) => ({
          id: (m.messageId as string) || Math.random().toString(),
          role: (m.isCreatedByUser ? 'user' : 'assistant') as 'user' | 'assistant',
          content: (m.text as string) || '',
        }));
        setMessages(mapped);
      }
    } catch (err) {
      console.warn('[Chat] Failed to load conversation messages:', err);
    }
  };

  const handleNewChat = () => {
    if (isGenerating) handleAbort();
    setActiveConversationId('');
    setMessages([]);
    setDrawerOpen(false);
  };

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      await deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.conversationId !== conversationId));
      if (activeConversationId === conversationId) {
        handleNewChat();
      }
    } catch {
      Alert.alert('Error', 'Failed to delete conversation.');
    }
  };

  const handleLogout = async () => {
    await clearAuthSession();
    router.replace('/(auth)/login');
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    setInputText('');
    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    // Append User Message
    const updatedMessages: MessageItem[] = [
      ...messages,
      { id: userMsgId, role: 'user', content: text },
      { id: assistantMsgId, role: 'assistant', content: '' },
    ];
    setMessages(updatedMessages);
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    await sendStreamingMessage(
      {
        text,
        conversationId: activeConversationId || undefined,
        endpoint: selectedModel.endpoint,
        model: selectedModel.id,
      },
      {
        onDelta: (delta) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: msg.content + delta } : msg,
            ),
          );
          scrollViewRef.current?.scrollToEnd({ animated: false });
        },
        onThinking: (thought) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, thought } : msg)),
          );
        },
        onToolCall: (toolCall) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, toolCall } : msg)),
          );
        },
        onArtifact: (artifact) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, artifact } : msg)),
          );
        },
        onComplete: (finalData) => {
          setIsGenerating(false);
          abortControllerRef.current = null;
          if (finalData.conversationId && !activeConversationId) {
            setActiveConversationId(finalData.conversationId);
            loadConversations();
          }
        },
        onError: (err) => {
          setIsGenerating(false);
          abortControllerRef.current = null;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: `Error: ${err.message || 'Stream interrupted'}` }
                : msg,
            ),
          );
        },
      },
      controller.signal,
    );
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView className="bg-background flex-1">
      {/* Top Header Bar */}
      <View className="flex-row items-center justify-between border-b border-border-light bg-surface-primary px-4 py-2.5">
        <TouchableOpacity
          onPress={() => setDrawerOpen(true)}
          className="h-9 w-9 items-center justify-center rounded-lg border border-border-light bg-surface-secondary"
        >
          <Menu size={18} color="#ececec" />
        </TouchableOpacity>

        {/* Model Switcher Pill */}
        <TouchableOpacity
          onPress={() => setModelPickerOpen(true)}
          className="flex-row items-center rounded-full border border-border-light bg-surface-secondary px-3 py-1.5"
        >
          <Sparkles size={13} color="#10a37f" />
          <Text className="mx-1.5 text-xs font-semibold text-text-primary">
            {selectedModel.name}
          </Text>
          <ChevronDown size={13} color="#8e8e8e" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNewChat}
          className="h-9 w-9 items-center justify-center rounded-lg border border-border-light bg-surface-secondary"
        >
          <Plus size={18} color="#ececec" />
        </TouchableOpacity>
      </View>

      {/* Main Chat Messages Feed */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        className="flex-1"
      >
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-4 py-3"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {messages.length === 0 ? (
            <View className="items-center justify-center py-24">
              <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl border border-border-light bg-surface-secondary">
                <Bot size={28} color="#10a37f" />
              </View>
              <Text className="text-lg font-bold text-text-primary">How can I help you today?</Text>
              <Text className="mt-1 text-xs text-text-tertiary">
                Connected with {selectedModel.name}
              </Text>
            </View>
          ) : (
            messages.map((item) => (
              <View
                key={item.id}
                className={`mb-4 flex-row ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {item.role === 'assistant' && (
                  <View className="bg-brand-green/20 border-brand-green/30 mr-2.5 mt-1 h-7 w-7 items-center justify-center rounded-lg border">
                    <Bot size={15} color="#10a37f" />
                  </View>
                )}

                <View
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    item.role === 'user'
                      ? 'border border-border-light bg-surface-secondary'
                      : 'border border-border-light bg-surface-primary'
                  }`}
                >
                  {/* Reasoning / Thinking Card */}
                  {item.thought && (
                    <View className="mb-2 rounded-lg border border-border-medium/40 bg-surface-secondary p-2.5">
                      <View className="mb-1 flex-row items-center">
                        <Brain size={12} color="#a5d6ff" />
                        <Text className="ml-1.5 text-[11px] font-semibold text-[#a5d6ff]">
                          Thinking Process
                        </Text>
                      </View>
                      <Text className="text-xs italic text-text-secondary">{item.thought}</Text>
                    </View>
                  )}

                  {/* Tool Call Card */}
                  {item.toolCall && (
                    <View className="mb-2 flex-row items-center justify-between rounded-lg border border-border-medium/40 bg-surface-secondary p-2.5">
                      <View className="flex-row items-center">
                        <Wrench size={13} color="#f59e0b" />
                        <Text className="ml-1.5 text-xs font-medium text-text-primary">
                          Tool: {item.toolCall.name}
                        </Text>
                      </View>
                      <View className="rounded bg-amber-500/20 px-2 py-0.5">
                        <Text className="text-[10px] font-semibold uppercase text-amber-400">
                          {item.toolCall.status}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Main Message Text */}
                  <Text className="text-sm leading-5 text-text-primary">
                    {item.content || (isGenerating && item.role === 'assistant' ? '...' : '')}
                  </Text>

                  {/* Interactive Artifact Preview Button */}
                  {item.artifact && (
                    <TouchableOpacity
                      onPress={() => setActiveArtifact(item.artifact!)}
                      className="bg-brand-green/15 border-brand-green/40 mt-3 flex-row items-center rounded-xl border px-3 py-2"
                    >
                      <Code2 size={14} color="#10a37f" />
                      <View className="ml-2 flex-1">
                        <Text className="text-brand-green text-xs font-semibold">
                          {item.artifact.title}
                        </Text>
                        <Text className="text-[10px] uppercase text-text-tertiary">
                          Tap to view preview & code
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>

                {item.role === 'user' && (
                  <View className="ml-2.5 mt-1 h-7 w-7 items-center justify-center rounded-lg border border-border-light bg-surface-secondary">
                    <UserIcon size={14} color="#ececec" />
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>

        {/* Input Composer Bar */}
        <View className="border-t border-border-light bg-surface-primary p-3">
          <View className="flex-row items-center rounded-2xl border border-border-medium bg-surface-secondary px-3.5 py-1.5">
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask anything..."
              placeholderTextColor="#666666"
              multiline
              maxLength={4000}
              className="max-h-24 flex-1 py-2 text-sm text-text-primary"
            />

            {isGenerating ? (
              <TouchableOpacity
                onPress={handleAbort}
                className="ml-2 h-8 w-8 items-center justify-center rounded-full border border-red-500/40 bg-red-500/20"
              >
                <Square size={14} color="#ef4444" fill="#ef4444" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSendMessage}
                disabled={!inputText.trim()}
                className={`ml-2 h-8 w-8 items-center justify-center rounded-full ${
                  inputText.trim() ? 'bg-brand-green' : 'bg-surface-tertiary'
                }`}
              >
                <Send size={14} color={inputText.trim() ? '#ffffff' : '#666666'} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Model Picker Sheet */}
      <Modal visible={modelPickerOpen} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setModelPickerOpen(false)}
          className="flex-1 justify-end bg-black/60"
        >
          <View className="rounded-t-3xl border-t border-border-light bg-surface-primary p-6">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-base font-bold text-text-primary">Select Model</Text>
              <TouchableOpacity onPress={() => setModelPickerOpen(false)}>
                <X size={18} color="#ececec" />
              </TouchableOpacity>
            </View>

            <View className="gap-2.5">
              {AVAILABLE_MODELS.map((model) => (
                <TouchableOpacity
                  key={model.id}
                  onPress={() => {
                    setSelectedModel(model);
                    setModelPickerOpen(false);
                  }}
                  className={`flex-row items-center justify-between rounded-xl border p-3.5 ${
                    selectedModel.id === model.id
                      ? 'bg-brand-green/10 border-brand-green'
                      : 'border-border-light bg-surface-secondary'
                  }`}
                >
                  <Text className="text-sm font-semibold text-text-primary">{model.name}</Text>
                  <Text className="text-xs uppercase text-text-tertiary">{model.endpoint}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Conversation History Drawer Modal */}
      <Modal visible={drawerOpen} animationType="slide">
        <SafeAreaView className="bg-background flex-1">
          <View className="flex-row items-center justify-between border-b border-border-light bg-surface-primary px-5 py-4">
            <Text className="text-lg font-bold text-text-primary">Conversations</Text>
            <TouchableOpacity
              onPress={() => setDrawerOpen(false)}
              className="h-8 w-8 items-center justify-center rounded-full border border-border-light bg-surface-secondary"
            >
              <X size={18} color="#ececec" />
            </TouchableOpacity>
          </View>

          {/* New Chat Button */}
          <View className="border-b border-border-light p-4">
            <TouchableOpacity
              onPress={handleNewChat}
              className="bg-brand-green flex-row items-center justify-center rounded-xl py-3"
            >
              <Plus size={16} color="#ffffff" />
              <Text className="ml-2 text-sm font-bold text-white">New Conversation</Text>
            </TouchableOpacity>
          </View>

          {/* Conversation List */}
          {loadingHistory ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color="#10a37f" />
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.conversationId}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View className="mb-2.5 flex-row items-center justify-between rounded-xl border border-border-light bg-surface-primary p-3.5">
                  <TouchableOpacity
                    onPress={() => handleSelectConversation(item)}
                    className="mr-3 flex-1"
                  >
                    <Text className="text-sm font-medium text-text-primary" numberOfLines={1}>
                      {item.title || 'Untitled Conversation'}
                    </Text>
                    <Text className="mt-1 text-[11px] text-text-tertiary">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDeleteConversation(item.conversationId)}
                    className="p-1.5"
                  >
                    <Trash2 size={16} color="#8e8e8e" />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <View className="items-center justify-center py-16">
                  <Text className="text-sm text-text-tertiary">No conversations yet.</Text>
                </View>
              }
            />
          )}

          {/* User Profile & Sign Out Footer */}
          <View className="flex-row items-center justify-between border-t border-border-light bg-surface-primary p-4">
            <View className="mr-3 flex-1">
              <Text className="text-sm font-semibold text-text-primary" numberOfLines={1}>
                {userProfile?.name || userProfile?.email || 'User'}
              </Text>
              <Text className="text-xs text-text-tertiary" numberOfLines={1}>
                {userProfile?.email}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleLogout}
              className="flex-row items-center rounded-lg border border-border-light bg-surface-secondary px-3 py-2"
            >
              <LogOut size={14} color="#ef4444" />
              <Text className="ml-1.5 text-xs font-semibold text-red-400">Sign Out</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Artifact Preview Modal */}
      <ArtifactModal
        visible={!!activeArtifact}
        artifact={activeArtifact}
        onClose={() => setActiveArtifact(null)}
      />
    </SafeAreaView>
  );
}
